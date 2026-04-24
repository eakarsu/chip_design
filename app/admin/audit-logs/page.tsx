'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import DataTable, { Column, FilterOption } from '@/components/DataTable';

interface AuditRow {
  id: string;
  userName: string;
  action: string;
  resource: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

const actionColors: Record<string, 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'default'> = {
  login: 'success', logout: 'default', create: 'primary', update: 'info', delete: 'error',
  password_change: 'warning', password_reset: 'warning', role_change: 'secondary',
  email_verify: 'success', bulk_delete: 'error', bulk_update: 'info', export: 'default',
};

const columns: Column<AuditRow>[] = [
  { id: 'userName', label: 'User', sortable: true, minWidth: 130 },
  { id: 'action', label: 'Action', sortable: true, render: (row) => <Chip label={row.action} size="small" color={actionColors[row.action] || 'default'} /> },
  { id: 'resource', label: 'Resource', sortable: true },
  { id: 'details', label: 'Details', minWidth: 200, render: (row) => row.details.length > 60 ? row.details.slice(0, 60) + '...' : row.details },
  { id: 'ipAddress', label: 'IP', sortable: true },
  { id: 'createdAt', label: 'Time', sortable: true, render: (row) => new Date(row.createdAt).toLocaleString() },
];

const filters: FilterOption[] = [
  { field: 'action', label: 'Action', options: [
    { value: 'login', label: 'Login' }, { value: 'logout', label: 'Logout' },
    { value: 'create', label: 'Create' }, { value: 'update', label: 'Update' },
    { value: 'delete', label: 'Delete' }, { value: 'password_change', label: 'Password Change' },
  ]},
];

export default function AuditLogsPage() {
  const [data, setData] = useState<AuditRow[]>([]);
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
      const res = await fetch(`/api/audit-logs?${params}`);
      const result = await res.json();
      setData(result.data || []); setTotal(result.total || 0);
    } catch { setData([]); setTotal(0); }
    setLoading(false);
  }, [page, pageSize, sortBy, sortOrder, search, activeFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>Audit Logs</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{total} total entries</Typography>
      <DataTable<AuditRow>
        columns={columns} data={data} total={total} page={page} pageSize={pageSize}
        loading={loading} sortBy={sortBy} sortOrder={sortOrder} search={search}
        filters={filters} activeFilters={activeFilters}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onSortChange={(s, o) => { setSortBy(s); setSortOrder(o); }}
        onSearchChange={setSearch}
        onFilterChange={(field, value) => setActiveFilters(prev => ({ ...prev, [field]: value }))}
        emptyIcon="history" emptyTitle="No audit logs found"
      />
    </Box>
  );
}
