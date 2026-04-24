'use client';

import { TextField, TextFieldProps } from '@mui/material';
import { useState, useCallback } from 'react';
import { ZodSchema, ZodError } from 'zod';

interface ValidatedFieldProps extends Omit<TextFieldProps, 'error' | 'helperText' | 'onChange'> {
  schema?: ZodSchema;
  value: string;
  onChange: (value: string) => void;
  validateOnBlur?: boolean;
  helperText?: React.ReactNode;
}

export default function ValidatedField({
  schema,
  value,
  onChange,
  validateOnBlur = true,
  helperText,
  ...props
}: ValidatedFieldProps) {
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);

  const validate = useCallback(
    (val: string) => {
      if (!schema) return;
      try {
        schema.parse(val);
        setError('');
      } catch (e) {
        if (e instanceof ZodError) {
          setError(e.errors[0]?.message || 'Invalid');
        }
      }
    },
    [schema]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    if (touched && !validateOnBlur) {
      validate(newValue);
    }
  };

  const handleBlur = () => {
    setTouched(true);
    validate(value);
  };

  return (
    <TextField
      {...props}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      error={touched && !!error}
      helperText={touched && error ? error : helperText}
    />
  );
}
