'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import DataTable, { Column, FilterOption } from '@/components/DataTable';

interface ErrorRow { id: string; message: string; endpoint?: string; method?: string; statusCode?: number; severity: string; resolved: boolean; createdAt: string; }

const severityColors: Record<string, 'success' | 'warning' | 'error' | 'info'> = { low: 'success', medium: 'warning', high: 'error', critical: 'error' };

const columns: Column<ErrorRow>[] = [
  { id: 'severity', label: 'Severity', sortable: true, render: (row) => <Chip label={row.severity} size="small" color={severityColors[row.severity] || 'default'} /> },
  { id: 'message', label: 'Message', sortable: true, minWidth: 250, render: (row) => row.message.length > 50 ? row.message.slice(0, 50) + '...' : row.message },
  { id: 'endpoint', label: 'Endpoint', sortable: true, render: (row) => row.endpoint || '—' },
  { id: 'method', label: 'Method', render: (row) => row.method || '—' },
  { id: 'statusCode', label: 'Status', render: (row) => row.statusCode ? String(row.statusCode) : '—' },
  { id: 'resolved', label: 'Resolved', render: (row) => (
    <span className="material-symbols-outlined" style={{ fontSize: 20, color: row.resolved ? '#16A34A' : '#EF4444' }}>
      {row.resolved ? 'check_circle' : 'cancel'}
    </span>
  )},
  { id: 'createdAt', label: 'Time', sortable: true, render: (row) => new Date(row.createdAt).toLocaleString() },
];

const filters: FilterOption[] = [
  { field: 'severity', label: 'Severity', options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' }] },
];

export default function ErrorLogsPage() {
  const [data, setData] = useState<ErrorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sortBy, sortOrder });
    if (search) params.set('search', search);
    Object.entries(activeFilters).forEach(([k, v]) => { if (v) params.set(k, v); });
    try {
      const res = await fetch(`/api/error-logs?${params}`);
      const result = await res.json();
      setData(result.data || []); setTotal(result.total || 0);
    } catch { setData([]); setTotal(0); }
    setLoading(false);
  }, [page, pageSize, sortBy, sortOrder, search, activeFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>Error Logs</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{total} total errors</Typography>
      <DataTable<ErrorRow>
        columns={columns} data={data} total={total} page={page} pageSize={pageSize}
        loading={loading} sortBy={sortBy} sortOrder={sortOrder} search={search}
        filters={filters} activeFilters={activeFilters}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onSortChange={(s, o) => { setSortBy(s); setSortOrder(o); }}
        onSearchChange={setSearch}
        onFilterChange={(field, value) => setActiveFilters(prev => ({ ...prev, [field]: value }))}
        emptyIcon="bug_report" emptyTitle="No error logs found"
      />
    </Box>
  );
}
