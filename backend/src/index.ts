import express from 'express';
import {
  HarmBlockThreshold,
  HarmCategory,
  VertexAI
} from '@google-cloud/vertexai';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import cors from 'cors'
import { Langfuse, LangfuseTraceClient } from 'langfuse';

dotenv.config();

const MODEL_NAME = 'gemini-1.5-flash-002';
const TEMPERATURE = 1.0;
const MAX_OUTPUT_TOKENS = 8192;

export const generateContent = async (context: string, inputText: string): Promise<string> => {
  const vertexAI = new VertexAI({
    project: process.env.PROJECT_ID,
    location: process.env.LOCATION
  });
  const generativeModel = vertexAI.getGenerativeModel({
    model: MODEL_NAME,
    // The following parameters are optional
    // They can also be passed to individual content generation requests
    safetySettings: [{category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE}],
    generationConfig: {
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
    systemInstruction: {
      role: 'system',
      parts: [{
        text: context
      }]
    },
  });

  const request = {
    contents: [{role: 'user', parts: [{text: inputText}]}],
  };
  const result = await generativeModel.generateContent(request);
  return result.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

const trace = (inputText: string, responseText: string, traceName: string) => {
  const langfuse = new Langfuse({
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl: process.env.LANGFUSE_HOST,
  });

  const trace = langfuse.trace({
    name: traceName,
  });

  trace.generation({
    model: MODEL_NAME,
    modelParameters: {
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
    input: inputText,
    output: responseText,
  });
}

const app = express();

app.use((_req: express.Request, _res: express.Response, next: express.NextFunction) => {
  next();
});

app.use(bodyParser.json());
app.use(cors());

app.post('/', async (req: express.Request, res: express.Response) => {
  if (process.env.NODE_ENV === 'local') {
    res.send({ message: req.body.input });
    return;
  }
  const langfuse = new Langfuse({
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl: process.env.LANGFUSE_HOST,
  });
  const context = await langfuse.getPrompt('ピープルマネジメント変数あり');
  const compiledContext = await context.compile({
    input: '新米マネージャーで、ピープルマネジメントの経験は非常に浅い'
  })
  const responseText = await generateContent(compiledContext, req.body.input);
  trace(req.body.input, responseText, 'sample-llm');
  res.send({ message: responseText })
});

app.post('/management', async (req: express.Request, res: express.Response) => {
  const { responseText } = await managementUsecase({ inputText: req.body.input, isEvaluation: false });
  res.send({ message: responseText });
});

const managementUsecase = async (input: { inputText: string; isEvaluation: boolean }): Promise<{
  langfuseTraceClient: LangfuseTraceClient,
  responseText: string,
}> => {
  const langfuse = new Langfuse({
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl: process.env.LANGFUSE_HOST,
  });
  const [
    managerPrompt1,
    managerPrompt2,
    managerPrompt3,
    managerPrompt4,
    managerPrompt5,
    summaryAdvicePrompt,
  ] = await Promise.all([
    langfuse.getPrompt('manager_1', undefined, { type: 'chat' }),
    langfuse.getPrompt('manager_2', undefined, { type: 'chat' }),
    langfuse.getPrompt('manager_3', undefined, { type: 'chat' }),
    langfuse.getPrompt('manager_4', undefined, { type: 'chat' }),
    langfuse.getPrompt('manager_5', undefined, { type: 'chat' }),
    langfuse.getPrompt('summary_advices', undefined, { type: 'chat' }),
  ]);
  const compiledManagerPrompts = await Promise.all(
    [
      managerPrompt1,
      managerPrompt2,
      managerPrompt3,
      managerPrompt4,
      managerPrompt5,
    ].map((managerPrompt) => managerPrompt.compile({
      user_input: input.inputText,
    }))
  );

  const [
    advice1,
    advice2,
    advice3,
    advice4,
    advice5,
  ] = await Promise.all(
    compiledManagerPrompts.map(async (compiledManagerPrompt) => {
      const instruction = compiledManagerPrompt.find((value) => value.role === 'system');
      const prompt = compiledManagerPrompt.find((value) => value.role === 'user');
      if (!instruction || !prompt) {
        throw Error('プロンプトが正しく設定されていません。');
      }
      return await generateContent(instruction.content, prompt.content)
    })
  );

  const compiledSummaryAdvicePrompt = await summaryAdvicePrompt.compile({
    user_input: input.inputText,
    advice_manager_first:  advice1,
    advice_manager_second: advice2,
    advice_manager_third:  advice3,
    advice_manager_fourth: advice4,
    advice_manager_fifth:  advice5,
  });
  const compiledSummaryAdviceInstruction = compiledSummaryAdvicePrompt.find((value) => value.role === 'system');
  const compiledSummaryAdviceUserPrompt = compiledSummaryAdvicePrompt.find((value) => value.role === 'user');
  if (!compiledSummaryAdviceInstruction || !compiledSummaryAdviceUserPrompt) {
    throw Error('プロンプトが正しく設定されていません。');
  }
  const responseText = await generateContent(
    compiledSummaryAdviceInstruction.content,
    compiledSummaryAdviceUserPrompt.content,
  );

  const trace = langfuse.trace({
    name: 'management_agent',
    input: input.inputText,
    output: responseText,
    tags: input.isEvaluation ? ['evaluation'] : null,
  });

  const adviseSpan = trace.span({
    name: 'Advise from each managers',
    input: input.inputText,
    output: {
      advice_manager_first:  advice1,
      advice_manager_second: advice2,
      advice_manager_third:  advice3,
      advice_manager_fourth: advice4,
      advice_manager_fifth:  advice5,
    }
  });
  [
    { prompt: managerPrompt1, output: advice1 },
    { prompt: managerPrompt2, output: advice2 },
    { prompt: managerPrompt3, output: advice3 },
    { prompt: managerPrompt4, output: advice4 },
    { prompt: managerPrompt5, output: advice5 },
  ].map((data, index) => {
    adviseSpan.generation({
      name: `manager${index + 1}`,
      model: MODEL_NAME,
      modelParameters: {
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
      input: {
        name: data.prompt.name,
        version: data.prompt.version,
        user_input: input.inputText,
      },
      output: data.output,
      prompt: data.prompt,
    });
  });

  const summarySpan = trace.span({
    name: 'Summary advices',
    input: {
      advice_manager_first:  advice1,
      advice_manager_second: advice2,
      advice_manager_third:  advice3,
      advice_manager_fourth: advice4,
      advice_manager_fifth:  advice5,
    },
    output: responseText,
  });
  summarySpan.generation({
    name: 'summary',
    model: MODEL_NAME,
    modelParameters: {
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
    input: {
      name: summaryAdvicePrompt.name,
      version: summaryAdvicePrompt.version,
      user_input: input.inputText,
      advice_manager_first:  advice1,
      advice_manager_second: advice2,
      advice_manager_third:  advice3,
      advice_manager_fourth: advice4,
      advice_manager_fifth:  advice5,
    },
    output: responseText,
    prompt: summaryAdvicePrompt,
  });

  return {
    langfuseTraceClient: trace,
    responseText,
  };
};

app.post('/evaluate-management', async (_req: express.Request, res: express.Response) => {
  const langfuse = new Langfuse({
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl: process.env.LANGFUSE_HOST,
  });

  const dataset = await langfuse.getDataset('Management Agent');
  const runName = `management-agent-${new Date()}`
  for (const item of dataset.items) {
    if (typeof item.input !== 'string') continue;
    const { langfuseTraceClient, responseText } = await managementUsecase({ inputText: item.input, isEvaluation: true });

    const evaluators = [
      {
        name: 'Helpfulness',
        promptName: 'evaluate_management_agent_helpfulness',
      },
      {
        name: 'Hallucination',
        promptName: 'evaluate_management_agent_hallucination',
      },
    ];
    for (const evaluator of evaluators) {
      try {
        const {
          value,
          comment,
        } = await evaluate({
          langfuse,
          promptName: evaluator.promptName,
          userInput: item.input,
          llmOutput: responseText
        });
        langfuseTraceClient.score({
          name: evaluator.name,
          value,
          comment,
        });
      } catch (error) {
        console.log(`${evaluator.name}の評価時にエラー`);
        console.log(error);
      }
    }

    item.link(langfuseTraceClient, runName);
  }
  await langfuse.flushAsync();
  res.send({ success: true });
});

const evaluate = async (input: { langfuse: Langfuse, promptName: string, userInput: string, llmOutput: string }): Promise<{ value: number; comment: string }> => {
  const { langfuse, promptName, userInput, llmOutput } = input;
  const prompt = await langfuse.getPrompt(promptName);
  const compiledPrompt = await prompt.compile({
    user_input: userInput,
    llm_output: llmOutput,
  });

  const evaluateResult = (await generateContent('', compiledPrompt)).replace(/(json|text|`)/g, '');
  return JSON.parse(evaluateResult);
}

app.post('/sample-trace', async (req: express.Request, res: express.Response) => {
  trace(req.body.input, req.body.output, 'sample-trace');
  res.send({ message: 'success' });
});

app.listen(process.env.PORT, () => {
  console.log(`Server is running at http://localhost:${process.env.PORT}`);
});
