'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Paper,
  Checkbox,
  TextField,
  Box,
  Button,
  Chip,
  Typography,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  IconButton,
  Toolbar,
  alpha,
  Tooltip,
  SelectChangeEvent,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import EmptyState from './EmptyState';
import LoadingSkeleton from './LoadingSkeleton';

export interface Column<T> {
  id: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
}

export interface FilterOption {
  field: string;
  label: string;
  options: { value: string; label: string }[];
}

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  filters?: FilterOption[];
  activeFilters?: Record<string, string>;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  onSearchChange?: (search: string) => void;
  onFilterChange?: (field: string, value: string) => void;
  onRowClick?: (row: T) => void;
  onBulkDelete?: (ids: string[]) => void;
  onBulkUpdate?: (ids: string[], updates: Record<string, unknown>) => void;
  rowHref?: (row: T) => string;
  emptyIcon?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  title?: string;
}

export default function DataTable<T extends { id: string }>({
  columns,
  data,
  total,
  page,
  pageSize,
  loading = false,
  sortBy,
  sortOrder = 'desc',
  search = '',
  filters = [],
  activeFilters = {},
  onPageChange,
  onPageSizeChange,
  onSortChange,
  onSearchChange,
  onFilterChange,
  onRowClick,
  onBulkDelete,
  rowHref,
  emptyIcon = 'inbox',
  emptyTitle = 'No data found',
  emptyDescription = 'There are no items to display.',
  title,
}: DataTableProps<T>) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState(search);

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelected(data.map(row => row.id));
    } else {
      setSelected([]);
    }
  };

  const handleSelect = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleSort = (column: string) => {
    if (!onSortChange) return;
    const isAsc = sortBy === column && sortOrder === 'asc';
    onSortChange(column, isAsc ? 'desc' : 'asc');
  };

  const handleRowClick = (row: T) => {
    if (rowHref) {
      router.push(rowHref(row));
    } else if (onRowClick) {
      onRowClick(row);
    }
  };

  const handleSearchSubmit = () => {
    onSearchChange?.(searchValue);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  const numSelected = selected.length;
  const rowCount = data.length;

  if (loading) {
    return <LoadingSkeleton variant="table" rows={pageSize} />;
  }

  return (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      {/* Toolbar with search and filters */}
      <Toolbar
        sx={{
          pl: 2,
          pr: 1,
          flexWrap: 'wrap',
          gap: 1,
          ...(numSelected > 0 && {
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
          }),
        }}
      >
        {numSelected > 0 ? (
          <>
            <Typography sx={{ flex: '1 1 100%' }} color="primary" variant="subtitle1">
              {numSelected} selected
            </Typography>
            {onBulkDelete && (
              <Tooltip title="Delete selected">
                <IconButton onClick={() => { onBulkDelete(selected); setSelected([]); }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#DC2626' }}>
                    delete
                  </span>
                </IconButton>
              </Tooltip>
            )}
          </>
        ) : (
          <>
            {title && (
              <Typography variant="h6" sx={{ mr: 2 }}>
                {title}
              </Typography>
            )}
            {onSearchChange && (
              <TextField
                size="small"
                placeholder="Search..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onBlur={handleSearchSubmit}
                sx={{ minWidth: 220 }}
                InputProps={{
                  startAdornment: (
                    <span className="material-symbols-outlined" style={{ fontSize: 20, marginRight: 8, opacity: 0.5 }}>
                      search
                    </span>
                  ),
                }}
              />
            )}
            <Box sx={{ flex: 1 }} />
            {filters.map((filter) => (
              <FormControl key={filter.field} size="small" sx={{ minWidth: 140 }}>
                <InputLabel>{filter.label}</InputLabel>
                <Select
                  value={activeFilters[filter.field] || ''}
                  label={filter.label}
                  onChange={(e: SelectChangeEvent) => onFilterChange?.(filter.field, e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  {filter.options.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ))}
          </>
        )}
      </Toolbar>

      <TableContainer>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              {onBulkDelete && (
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={numSelected > 0 && numSelected < rowCount}
                    checked={rowCount > 0 && numSelected === rowCount}
                    onChange={handleSelectAll}
                  />
                </TableCell>
              )}
              {columns.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.align || 'left'}
                  sx={{ minWidth: col.minWidth, fontWeight: 600 }}
                  sortDirection={sortBy === col.id ? sortOrder : false}
                >
                  {col.sortable && onSortChange ? (
                    <TableSortLabel
                      active={sortBy === col.id}
                      direction={sortBy === col.id ? sortOrder : 'asc'}
                      onClick={() => handleSort(col.id)}
                    >
                      {col.label}
                    </TableSortLabel>
                  ) : (
                    col.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (onBulkDelete ? 1 : 0)}>
                  <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => {
                const isSelected = selected.includes(row.id);
                return (
                  <TableRow
                    key={row.id}
                    hover
                    selected={isSelected}
                    onClick={() => handleRowClick(row)}
                    sx={{ cursor: (rowHref || onRowClick) ? 'pointer' : 'default' }}
                  >
                    {onBulkDelete && (
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={isSelected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => handleSelect(row.id)}
                        />
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell key={col.id} align={col.align || 'left'}>
                        {col.render
                          ? col.render(row)
                          : String((row as Record<string, unknown>)[col.id] ?? '')}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={total}
        rowsPerPage={pageSize}
        page={page - 1}
        onPageChange={(_, newPage) => onPageChange(newPage + 1)}
        onRowsPerPageChange={(e) => {
          onPageSizeChange(parseInt(e.target.value, 10));
          onPageChange(1);
        }}
      />
    </Paper>
  );
}
