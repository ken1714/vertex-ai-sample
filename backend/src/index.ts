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
    instruction1,
    instruction2,
    instruction3,
    instruction4,
    instruction5,
    advisePrompt,
    summaryInstruction,
    summaryAdvicePrompt,
  ] = await Promise.all([
    langfuse.getPrompt('manager_system_instruction_1'),
    langfuse.getPrompt('manager_system_instruction_2'),
    langfuse.getPrompt('manager_system_instruction_3'),
    langfuse.getPrompt('manager_system_instruction_4'),
    langfuse.getPrompt('manager_system_instruction_5'),
    langfuse.getPrompt('advise_people_management_prompt'),
    langfuse.getPrompt('summary_instruction'),
    langfuse.getPrompt('summary_advice'),
  ]);
  const compiledInstructions = await Promise.all(
    [
      instruction1,
      instruction2,
      instruction3,
      instruction4,
      instruction5,
    ].map((instruction) => instruction.compile())
  );
  const compiledAdvisePrompt = advisePrompt.compile({
    user_input: input.inputText,
  });

  const [
    advice1,
    advice2,
    advice3,
    advice4,
    advice5,
  ] = await Promise.all(
    compiledInstructions.map((compiledInstruction) => generateContent(compiledInstruction, compiledAdvisePrompt))
  );

  const [
    compiledSummaryInstruction,
    compiledSummaryPrompt,
  ] = await Promise.all([
    summaryInstruction.compile(),
    summaryAdvicePrompt.compile({
      user_input: input.inputText,
      advice_manager_first:  advice1,
      advice_manager_second: advice2,
      advice_manager_third:  advice3,
      advice_manager_fourth: advice4,
      advice_manager_fifth:  advice5,
    }),
  ]);
  const responseText = await generateContent(compiledSummaryInstruction, compiledSummaryPrompt)

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
    { instruction: instruction1, content: compiledInstructions[0], output: advice1 },
    { instruction: instruction2, content: compiledInstructions[1], output: advice2 },
    { instruction: instruction3, content: compiledInstructions[2], output: advice3 },
    { instruction: instruction4, content: compiledInstructions[3], output: advice4 },
    { instruction: instruction5, content: compiledInstructions[4], output: advice5 },
  ].map((data, index) => {
    adviseSpan.generation({
      name: `manager${index + 1}`,
      model: MODEL_NAME,
      modelParameters: {
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
      input: {
        system_instruction: {
          name: data.instruction.name,
          version: data.instruction.version,
          content: data.content,
        },
        prompt: {
          name: advisePrompt.name,
          version: advisePrompt.version,
          user_input: input.inputText,
          content: compiledAdvisePrompt,
        }
      },
      output: data.output,
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
      system_instruction: {
        name: summaryInstruction.name,
        version: summaryInstruction.version,
        content: compiledSummaryInstruction,
      },
      prompt: {
        name: summaryAdvicePrompt.name,
        version: summaryAdvicePrompt.version,
        user_input: input.inputText,
        advice_manager_first:  advice1,
        advice_manager_second: advice2,
        advice_manager_third:  advice3,
        advice_manager_fourth: advice4,
        advice_manager_fifth:  advice5,
        content: compiledSummaryPrompt,
      }
    },
    output: responseText,
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
