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
  CircularProgress,
} from '@mui/material';
import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import styled from "styled-components";

// APIリクエストの状態を管理するための型
type RequestState = {
  isLoading: boolean;
  error: string | null;
};

const LeftReactMarkdown = styled(ReactMarkdown)`
  text-align: left;
`

const App = () => {
  const [inputValue, setInputValue] = useState<string>();
  const [traceInputValue, setTraceInputValue] = useState<string>();
  const [traceResponseValue, setTraceResponseValue] = useState<string>();
  const [responseText, setResponseText] = useState<string>();
  const [selectedLlmVersion, setSelectedLlmVersion] = useState<string>('gemini-2.0-flash-001');
  const [requestState, setRequestState] = useState<RequestState>({
    isLoading: false,
    error: null,
  });

  // APIリクエストを扱う共通関数
  const handleApiRequest = useCallback(async (
    apiCall: () => Promise<any>,
    onSuccess?: (data: any) => void
  ) => {
    setRequestState({ isLoading: true, error: null });
    try {
      const response = await apiCall();
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (onSuccess) {
        onSuccess(data);
      }
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '予期せぬエラーが発生しました';
      setRequestState(prev => ({ ...prev, error: errorMessage }));
      throw error;
    } finally {
      setRequestState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // LLMへの入力送信処理
  const sendInput = useCallback(async () => {
    if (!inputValue) return;

    await handleApiRequest(
      () => fetch(`${import.meta.env.VITE_BACKEND_URL}/management`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: inputValue,
          llmVersion: selectedLlmVersion,
        }),
      }),
      (data) => {
        setResponseText(data.message);
        setInputValue('');
      }
    );
  }, [inputValue, selectedLlmVersion, handleApiRequest]);

  // サンプルトレース送信処理
  const sendSampleTrace = useCallback(async () => {
    if (!traceInputValue || !traceResponseValue) return;

    await handleApiRequest(
      () => fetch(`${import.meta.env.VITE_BACKEND_URL}/sample-trace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: traceInputValue,
          output: traceResponseValue,
        }),
      }),
      () => {
        setTraceInputValue('');
        setTraceResponseValue('');
      }
    );
  }, [traceInputValue, traceResponseValue, handleApiRequest]);

  // 評価実施処理
  const sendEvaluation = useCallback(async () => {
    await handleApiRequest(
      () => fetch(`${import.meta.env.VITE_BACKEND_URL}/evaluate-management`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          llmVersion: selectedLlmVersion,
        }),
      })
    );
  }, [selectedLlmVersion, handleApiRequest]);

  return (
    <>
      {/* エラー表示 */}
      {requestState.error && (
        <Box sx={{ color: 'error.main', mb: 2 }}>
          {requestState.error}
        </Box>
      )}

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
        <Button 
          onClick={sendSampleTrace}
          disabled={requestState.isLoading}
        >
          サンプルトレース送信
        </Button>
        <Button 
          onClick={sendEvaluation}
          disabled={requestState.isLoading}
        >
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
            event.preventDefault();
            await sendInput();
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
                <IconButton type="submit" disabled={requestState.isLoading}>
                  {requestState.isLoading ? <CircularProgress size={24} /> : <SendIcon />}
                </IconButton>
              </InputAdornment>
            }
            disabled={requestState.isLoading}
          />
        </Paper>
        <Paper>
          {requestState.isLoading ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : (
            <LeftReactMarkdown>
              {responseText ?? ''}
            </LeftReactMarkdown>
          )}
        </Paper>
      </Box>
    </>
  );
};

export default App;
