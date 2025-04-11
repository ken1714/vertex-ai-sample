import express from 'express';
import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/genai';
import bodyParser from 'body-parser';
import { config } from 'dotenv';
import cors from 'cors'
import { Langfuse, LangfuseTraceClient } from 'langfuse';

config();

const DEFAULT_MODEL_NAME = 'gemini-2.0-flash-001';
const TEMPERATURE = 1.0;
const MAX_OUTPUT_TOKENS = 8192;

type GenerativeAIOutput = {
  content: string;
  inputToken: number;
  outputToken: number;
  inputCost: number;
  outputCost: number;
  startTime: Date;
  endTime: Date;
};

// Gemini 2.0 Flashのみ対応。Batch APIの価格での計算
const calculateVertexAIInputCost = (inputToken: number): number => {
  return 0.075 * inputToken / 1e6;
}

const calculateVertexAIOutputCost = (outputToken: number): number => {
  return 0.30 * outputToken / 1e6;
}

export const generateContent = async (context: string, inputText: string, modelName: string = DEFAULT_MODEL_NAME): Promise<GenerativeAIOutput> => {
  const startTime = new Date();
  // TODO: リージョンは後でインフラに合わせる
  const vertexAI = new GoogleGenAI({
    vertexai: true,
    project: process.env.PROJECT_ID,
    location: 'us-central1'
  });

  const result = await vertexAI.models.generateContent({
    model: modelName,
    contents: inputText,
    config: {
      systemInstruction: context,
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        }
      ],
    }
  });
  const resultText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const inputToken = result.usageMetadata?.promptTokenCount || 0;
  const outputToken = result.usageMetadata?.candidatesTokenCount || 0;
  return {
    content: resultText,
    inputToken,
    outputToken,
    inputCost: calculateVertexAIInputCost(inputToken),
    outputCost: calculateVertexAIOutputCost(outputToken),
    startTime,
    endTime: new Date(),
  }
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
    model: DEFAULT_MODEL_NAME,
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
  trace(req.body.input, responseText.content, 'sample-llm');
  res.send({ message: responseText })
});

app.post('/management', async (req: express.Request, res: express.Response) => {
  const { responseText } = await managementUsecase({ 
    inputText: req.body.input, 
    isEvaluation: false,
    llmVersion: req.body.llmVersion || DEFAULT_MODEL_NAME
  });
  res.send({ message: responseText });
});

const managementUsecase = async (input: { 
  inputText: string; 
  llmVersion: string;
  isEvaluation: boolean;
}): Promise<{
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
      return await generateContent(instruction.content, prompt.content, input.llmVersion)
    })
  );

  const compiledSummaryAdvicePrompt = await summaryAdvicePrompt.compile({
    user_input: input.inputText,
    advice_manager_first:  advice1.content,
    advice_manager_second: advice2.content,
    advice_manager_third:  advice3.content,
    advice_manager_fourth: advice4.content,
    advice_manager_fifth:  advice5.content,
  });
  const compiledSummaryAdviceInstruction = compiledSummaryAdvicePrompt.find((value) => value.role === 'system');
  const compiledSummaryAdviceUserPrompt = compiledSummaryAdvicePrompt.find((value) => value.role === 'user');
  if (!compiledSummaryAdviceInstruction || !compiledSummaryAdviceUserPrompt) {
    throw Error('プロンプトが正しく設定されていません。');
  }
  const summary = await generateContent(
    compiledSummaryAdviceInstruction.content,
    compiledSummaryAdviceUserPrompt.content,
    input.llmVersion
  );

  const trace = langfuse.trace({
    name: 'management_agent',
    input: input.inputText,
    output: summary.content,
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
      model: input.llmVersion,
      modelParameters: {
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
      input: {
        name: data.prompt.name,
        version: data.prompt.version,
        user_input: input.inputText,
      },
      output: data.output.content,
      prompt: data.prompt,
      usageDetails: {
        input: data.output.inputToken,
        output: data.output.outputToken,
      },
      costDetails: {
        input: data.output.inputCost,
        output: data.output.outputCost,
      },
      startTime: data.output.startTime,
      completionStartTime: data.output.endTime,
      endTime: data.output.endTime,
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
    output: summary.content,
  });
  summarySpan.generation({
    name: 'summary',
    model: input.llmVersion,
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
    output: summary.content,
    prompt: summaryAdvicePrompt,
    usageDetails: {
      input: summary.inputToken,
      output: summary.outputToken,
    },
    costDetails: {
      input: summary.inputCost,
      output: summary.outputCost,
    },
    startTime: summary.startTime,
    completionStartTime: summary.endTime,
    endTime: summary.endTime,
  });

  return {
    langfuseTraceClient: trace,
    responseText: summary.content,
  };
};

app.post('/evaluate-management', async (req: express.Request, res: express.Response) => {
  const langfuse = new Langfuse({
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl: process.env.LANGFUSE_HOST,
  });

  const dataset = await langfuse.getDataset('Management Agent');
  const runName = `management-agent-${new Date()}`
  for (const item of dataset.items) {
    if (typeof item.input !== 'string') continue;
    const { langfuseTraceClient, responseText } = await managementUsecase({ 
      inputText: item.input, 
      isEvaluation: true,
      llmVersion: req.body.llmVersion || DEFAULT_MODEL_NAME
    });

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

  const evaluateResult = (await generateContent('', compiledPrompt, DEFAULT_MODEL_NAME)).content.replace(/(json|text|`)/g, '');
  return JSON.parse(evaluateResult);
}

app.post('/sample-trace', async (req: express.Request, res: express.Response) => {
  trace(req.body.input, req.body.output, 'sample-trace');
  res.send({ message: 'success' });
});

app.listen(process.env.PORT, () => {
  console.log(`Server is running at http://localhost:${process.env.PORT}`);
});
