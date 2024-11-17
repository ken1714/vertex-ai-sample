
import './App.css';

import SendIcon from '@mui/icons-material/Send';
import {
  Box,
  IconButton,
  InputAdornment,
  InputBase,
  Paper,
} from '@mui/material';
import { useState } from 'react';

const App = () => {
  const [inputValue, setInputValue] = useState<string>();
  const [responseValue, setResponseValue] = useState<string>();

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
    setResponseValue(data.message);
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
          {responseValue}
        </Paper>
      </Box>
    </>
  );
};

export default App;
