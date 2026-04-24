'use client';

import { Box, Typography, LinearProgress } from '@mui/material';
import type { PasswordStrength as PasswordStrengthType } from '@/types/auth';

interface PasswordStrengthProps {
  strength: PasswordStrengthType;
}

export default function PasswordStrength({ strength }: PasswordStrengthProps) {
  const progress = (strength.score / 4) * 100;

  const requirements = [
    { key: 'minLength', label: 'At least 8 characters' },
    { key: 'hasUppercase', label: 'One uppercase letter' },
    { key: 'hasLowercase', label: 'One lowercase letter' },
    { key: 'hasNumber', label: 'One number' },
    { key: 'hasSpecial', label: 'One special character' },
    { key: 'noCommonPatterns', label: 'No common patterns' },
  ];

  return (
    <Box sx={{ mt: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Password Strength
        </Typography>
        <Typography variant="caption" sx={{ color: strength.color, fontWeight: 600 }}>
          {strength.label}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: 'action.hover',
          '& .MuiLinearProgress-bar': {
            bgcolor: strength.color,
            borderRadius: 3,
          },
        }}
      />
      <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
        {requirements.map(({ key, label }) => {
          const passed = strength.checks[key as keyof typeof strength.checks];
          return (
            <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: passed ? '#16A34A' : '#9CA3AF' }}
              >
                {passed ? 'check_circle' : 'circle'}
              </span>
              <Typography variant="caption" color={passed ? 'text.primary' : 'text.secondary'}>
                {label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
