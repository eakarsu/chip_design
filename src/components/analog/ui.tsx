'use client';

/** Small shared presentational pieces for the Analog Power Design Studio. */
import type { ReactNode } from 'react';
import type { ChipProps } from '@mui/material/Chip';
import { Alert, Chip } from '@mui/material';
import type { AnalogProject } from './types';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

const CHECK_STATUS_COLORS: Record<CheckStatus, ChipProps['color']> = {
  pass: 'success',
  warn: 'warning',
  fail: 'error',
  unknown: 'default',
};

export function CheckStatusChip({ status, label }: { status: CheckStatus; label?: string }) {
  return <Chip size="small" color={CHECK_STATUS_COLORS[status]} label={label ?? status} />;
}

const PROJECT_STATUS_COLORS: Record<AnalogProject['status'], ChipProps['color']> = {
  draft: 'default',
  designed: 'info',
  simulated: 'primary',
  reviewed: 'warning',
  approved: 'success',
};

export function ProjectStatusChip({ status }: { status: AnalogProject['status'] }) {
  return <Chip size="small" color={PROJECT_STATUS_COLORS[status]} label={status} />;
}

export function EmptyNotice({ children }: { children: ReactNode }) {
  return <Alert severity="info">{children}</Alert>;
}
