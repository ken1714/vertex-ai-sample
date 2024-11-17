
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

  const sendInput = () => {
    setResponseValue(inputValue);
    setInputValue('');
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      if (event.shiftKey) {
        setInputValue(inputValue + '\n');
      } else {
        sendInput();
      }
    }
  };

  const handleChange = (event) => {
    setInputValue(event.target.value);
  };

  const handleSubmit = (event) => {
    sendInput();
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
