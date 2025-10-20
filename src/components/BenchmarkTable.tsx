'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  Chip,
  TableSortLabel,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useState } from 'react';

export interface BenchmarkData {
  model: string;
  category: string;
  performance: number;
  powerEfficiency: number;
  throughput: string;
  latency: string;
  highlight?: boolean;
}

interface BenchmarkTableProps {
  data: BenchmarkData[];
  title?: string;
}

type OrderDirection = 'asc' | 'desc';
type OrderBy = keyof BenchmarkData;

export default function BenchmarkTable({ data, title }: BenchmarkTableProps) {
  const theme = useTheme();
  const [orderBy, setOrderBy] = useState<OrderBy>('performance');
  const [order, setOrder] = useState<OrderDirection>('desc');

  const handleRequestSort = (property: OrderBy) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const sortedData = [...data].sort((a, b) => {
    const aValue = a[orderBy];
    const bValue = b[orderBy];

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return order === 'asc' ? aValue - bValue : bValue - aValue;
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return order === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }

    return 0;
  });

  return (
    <Box>
      {title && (
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
          {title}
        </Typography>
      )}
      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: theme.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.04)' : 'rgba(129, 140, 248, 0.08)' }}>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'model'}
                  direction={orderBy === 'model' ? order : 'asc'}
                  onClick={() => handleRequestSort('model')}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Model
                  </Typography>
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Category
                </Typography>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={orderBy === 'performance'}
                  direction={orderBy === 'performance' ? order : 'asc'}
                  onClick={() => handleRequestSort('performance')}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Performance (TOPS)
                  </Typography>
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={orderBy === 'powerEfficiency'}
                  direction={orderBy === 'powerEfficiency' ? order : 'asc'}
                  onClick={() => handleRequestSort('powerEfficiency')}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Power Efficiency (TOPS/W)
                  </Typography>
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Throughput
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Latency
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedData.map((row, index) => (
              <TableRow
                key={index}
                sx={{
                  bgcolor: row.highlight
                    ? theme.palette.mode === 'light'
                      ? 'rgba(79, 70, 229, 0.02)'
                      : 'rgba(129, 140, 248, 0.04)'
                    : 'transparent',
                  '&:hover': {
                    bgcolor: theme.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.04)' : 'rgba(129, 140, 248, 0.08)',
                  },
                }}
              >
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: row.highlight ? 600 : 400 }}>
                    {row.model}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip label={row.category} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" sx={{ fontWeight: row.highlight ? 600 : 400 }}>
                    {row.performance}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" sx={{ fontWeight: row.highlight ? 600 : 400 }}>
                    {row.powerEfficiency}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{row.throughput}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{row.latency}</Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
