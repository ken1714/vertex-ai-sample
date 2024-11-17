import express from 'express';
import {
  HarmBlockThreshold,
  HarmCategory,
  VertexAI
} from '@google-cloud/vertexai';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import cors from 'cors'

dotenv.config();

export const generateContent = async (inputText: string): Promise<string> => {
  const vertexAI = new VertexAI({
    project: process.env.PROJECT_ID,
    location: process.env.LOCATION
  });
  const generativeModel = vertexAI.getGenerativeModel({
    model: 'gemini-1.0-pro',
    // The following parameters are optional
    // They can also be passed to individual content generation requests
    safetySettings: [{category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE}],
    generationConfig: {maxOutputTokens: 256},
    systemInstruction: {
      role: 'system',
      parts: [{
        "text":
          `あなたはピープルマネジメントのエキスパートで、人間科学や組織化学の専門知識を豊富に持っています。
          あなたの役割は1on1で話す内容が分からないマネージャーに対し、適切な打ち手を提示することです。
          あなたはこれから、入力された悩みに対して適切にアドバイスしてください。`
      }]
    },
  });

  const request = {
    contents: [{role: 'user', parts: [{text: inputText}]}],
  };
  const result = await generativeModel.generateContent(request);
  const response = result.response;
  return JSON.stringify(response);
};

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
  res.send({ message: await generateContent(req.body.input) })
});

app.listen(process.env.PORT, () => {
  console.log(`Server is running at http://localhost:${process.env.PORT}`);
});
