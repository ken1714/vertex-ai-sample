
import './App.css';

import SendIcon from '@mui/icons-material/Send';
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  InputBase,
  Paper,
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
  const sendInput = async () => {
    const response = await fetch(import.meta.env.VITE_BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: inputValue,
      }),
    });
    const data = await response.json();
    setResponse(JSON.parse(data.message));
    setInputValue('');
  };

  const handleKeyDown = async (event) => {
    if (event.key === 'Enter') {
      if (event.shiftKey) {
        setInputValue(inputValue + '\n');
      } else {
        await sendInput();
      }
    }
  };

  const handleChange = (event) => {
    setInputValue(event.target.value);
  };

  const handleSubmit = async (event) => {
    await sendInput();
    event.preventDefault();
  };

  return (
    <>
      <p>トレース入力サンプル</p>
      <Box>
        <InputBase
          fullWidth
          multiline
          value={inputValue}
          sx={{ ml: 1, flex: 1 }}
          placeholder="トレース入力サンプル"
          onChange={(event) => {
            setTraceInputValue(event.target.value)
          }}
        />
        <InputBase
          fullWidth
          multiline
          value={inputValue}
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
          トレース送信
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
          onSubmit={handleSubmit}
        >
          <InputBase
            fullWidth
            multiline
            value={inputValue}
            sx={{ ml: 1, flex: 1 }}
            placeholder="LLMに聞く"
            inputProps={{ 'aria-label': 'ask-llm' }}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
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
