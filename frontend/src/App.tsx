import './App.css';

import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
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

// APIリクエストの状態を管理するための型を分割
type LlmRequestState = {
  isLoading: boolean;
  error: string | null;
};

type EvaluationState = {
  isCompleted: boolean;
  isLoading: boolean;
  error: string | null;
};

const LeftReactMarkdown = styled(ReactMarkdown)`
  text-align: left;
`

const App = () => {
  const [inputValue, setInputValue] = useState<string>();
  const [responseText, setResponseText] = useState<string>();
  const [selectedLlmVersion, setSelectedLlmVersion] = useState<string>('gemini-2.0-flash-001');
  const [llmRequestState, setLlmRequestState] = useState<LlmRequestState>({
    isLoading: false,
    error: null,
  });
  const [evaluationState, setEvaluationState] = useState<EvaluationState>({
    isCompleted: false,
    isLoading: false,
    error: null,
  });

  // LLMリクエスト用の共通関数
  const handleLlmRequest = useCallback(async (
    apiCall: () => Promise<any>,
    onSuccess?: (data: any) => void
  ) => {
    setLlmRequestState({ isLoading: true, error: null });
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
      setLlmRequestState(prev => ({ ...prev, error: errorMessage }));
      throw error;
    } finally {
      setLlmRequestState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // 評価用の共通関数
  const handleEvaluationRequest = useCallback(async (
    apiCall: () => Promise<any>
  ) => {
    setEvaluationState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await apiCall();
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      await response.json();
      setEvaluationState(prev => ({ ...prev, isCompleted: true, isLoading: false }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '予期せぬエラーが発生しました';
      setEvaluationState(prev => ({ 
        ...prev, 
        isCompleted: false, 
        isLoading: false,
        error: errorMessage 
      }));
    }
  }, []);

  // LLMへの入力送信処理
  const sendInput = useCallback(async () => {
    if (!inputValue) return;

    await handleLlmRequest(
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
  }, [inputValue, selectedLlmVersion, handleLlmRequest]);

  // 評価実施処理
  const sendEvaluation = useCallback(async () => {
    await handleEvaluationRequest(
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
  }, [selectedLlmVersion, handleEvaluationRequest]);

  return (
    <>
      {/* エラー表示 */}
      {llmRequestState.error && (
        <Box sx={{ color: 'error.main', mb: 2 }}>
          {llmRequestState.error}
        </Box>
      )}
      {evaluationState.error && (
        <Box sx={{ color: 'error.main', mb: 2 }}>
          {evaluationState.error}
        </Box>
      )}

      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        mb: 2
      }}>
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
        <Button 
          variant="contained"
          color="primary"
          size="large"
          sx={{
            m: 1,
            fontWeight: 'bold',
            minWidth: '200px',
            boxShadow: 3,
            '&:hover': {
              boxShadow: 6,
            }
          }}
          onClick={sendEvaluation}
          disabled={evaluationState.isLoading}
          endIcon={
            evaluationState.isLoading ? (
              <CircularProgress size={20} color="inherit" />
            ) : null
          }
        >
          評価の実施
        </Button>
        {evaluationState.isCompleted && (
          <CheckCircleIcon sx={{ color: 'success.main', ml: 1, fontSize: 30 }} />
        )}
      </Box>
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
                <IconButton type="submit" disabled={llmRequestState.isLoading}>
                  {llmRequestState.isLoading ? <CircularProgress size={24} /> : <SendIcon />}
                </IconButton>
              </InputAdornment>
            }
            disabled={llmRequestState.isLoading}
          />
        </Paper>
        <Paper>
          {llmRequestState.isLoading ? (
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
