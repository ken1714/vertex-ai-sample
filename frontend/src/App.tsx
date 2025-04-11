import './App.css';

import SendIcon from '@mui/icons-material/Send';
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  InputBase,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import styled from "styled-components";

type GenerateContent = {
  candidates: {
    content: {
      role: string;
      parts: {
        text: string;
      }[];
    };
    finishReason: string;
    safetyRatings: {
      category: string;
      probability: string;
      probabilityScore: number;
      severity: string;
      severityScore: number;
    }[];
    avgLogprobs: number;
    index: number;
  }[];
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  modelVersion: string;
};

const LeftReactMarkdown = styled(ReactMarkdown)`
  text-align: left;
`

const App = () => {
  const [inputValue, setInputValue] = useState<string>();
  const [traceInputValue, setTraceInputValue] = useState<string>();
  const [traceResponseValue, setTraceResponseValue] = useState<string>();
  const [response, setResponse] = useState<GenerateContent>();
  const [selectedLlmVersion, setSelectedLlmVersion] = useState<string>('gemini-2.0-flash-001');

  const sendInput = async () => {
    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/management`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: inputValue,
        llmVersion: selectedLlmVersion,
      }),
    });
    const data = await response.json();
    setResponse(JSON.parse(data.message));
    setInputValue('');
  };

  return (
    <>
      <p>トレース入力サンプル</p>
      <Box>
        <FormControl sx={{ m: 1, minWidth: 120 }}>
          <InputLabel id="gemini-version-label">LLM Version</InputLabel>
          <Select
            labelId="gemini-version-label"
            value={selectedLlmVersion}
            label="LLM Version"
            onChange={(e) => setSelectedLlmVersion(e.target.value)}
          >
            <MenuItem value="gemini-2.0-flash-001">Gemini 2.0 Flash</MenuItem>
            <MenuItem value="gemini-2.0-flash-lite-001">Gemini 2.0 Flash Lite</MenuItem>
          </Select>
        </FormControl>
        <InputBase
          fullWidth
          multiline
          value={traceInputValue}
          sx={{ ml: 1, flex: 1 }}
          placeholder="トレース入力サンプル"
          onChange={(event) => {
            setTraceInputValue(event.target.value)
          }}
        />
        <InputBase
          fullWidth
          multiline
          value={traceResponseValue}
          sx={{ ml: 1, flex: 1 }}
          placeholder="トレース出力サンプル"
          onChange={(event) => {
            setTraceResponseValue(event.target.value)
          }}
        />
        <Button onClick={() => {
          fetch(import.meta.env.VITE_BACKEND_URL + '/sample-trace', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              input: traceInputValue,
              output: traceResponseValue,
            }),
          });
          setTraceInputValue('');
          setTraceResponseValue('');
        }}>
          サンプルトレース送信
        </Button>
        <Button onClick={() => {
          fetch(import.meta.env.VITE_BACKEND_URL + '/evaluate-management', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              llmVersion: selectedLlmVersion,
            }),
          });
        }}>
          評価の実施
        </Button>
      </Box>
      <p>LLMへの送信用</p>
      <Box
        sx={{
          p: '2px 4px',
          width: '100%'
        }}
      >
        <Paper
          component="form"
          onSubmit={async (event) => {
            await sendInput();
            event.preventDefault();
          }}
        >
          <InputBase
            fullWidth
            multiline
            value={inputValue}
            sx={{ ml: 1, flex: 1 }}
            placeholder="LLMに聞く"
            inputProps={{ 'aria-label': 'ask-llm' }}
            onChange={(event) => {
              setInputValue(event.target.value)
            }}
            onKeyDown={async (event) => {
              if (event.key === 'Enter') {
                if (event.shiftKey) {
                  setInputValue(inputValue + '\n');
                } else {
                  await sendInput();
                }
              }
            }}
            endAdornment={
              <InputAdornment position="end">
                <IconButton type="submit">
                  <SendIcon />
                </IconButton>
              </InputAdornment>
            }
          />
        </Paper>
        <Paper>
          <LeftReactMarkdown>
            {
              response ? response?.candidates.map((candidate) =>
                candidate.content.parts.map((part) => part.text).join('')
              ).join('') : ''
            }
          </LeftReactMarkdown>
        </Paper>
      </Box>
    </>
  );
};

export default App;
