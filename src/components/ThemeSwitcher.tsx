'use client';

import { IconButton, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useContext } from 'react';
import { ColorModeContext } from '@/app/ThemeRegistry';

export default function ThemeSwitcher() {
  const theme = useTheme();
  const colorMode = useContext(ColorModeContext);

  return (
    <Tooltip title={`Switch to ${theme.palette.mode === 'light' ? 'dark' : 'light'} mode`}>
      <IconButton
        onClick={colorMode.toggleColorMode}
        aria-label="toggle theme"
        sx={{
          color: 'text.primary',
          '&:hover': {
            backgroundColor: theme.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.04)' : 'rgba(129, 140, 248, 0.08)',
          },
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
          {theme.palette.mode === 'light' ? 'dark_mode' : 'light_mode'}
        </span>
      </IconButton>
    </Tooltip>
  );
}
