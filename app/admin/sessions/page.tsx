'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import DataTable, { Column, FilterOption } from '@/components/DataTable';

interface SessionRow {
  id: string;
  userId: string;
  browser: string;
  os: string;
  ipAddress: string;
  active: boolean;
  expiresAt: string;
  createdAt: string;
}

const columns: Column<SessionRow>[] = [
  { id: 'id', label: 'Session ID', sortable: true, minWidth: 120, render: (row) => row.id.slice(0, 12) + '...' },
  { id: 'userId', label: 'User ID', sortable: true },
  { id: 'browser', label: 'Browser', sortable: true },
  { id: 'os', label: 'OS', sortable: true },
  { id: 'ipAddress', label: 'IP Address', sortable: true },
  {
    id: 'active',
    label: 'Status',
    sortable: true,
    render: (row) => <Chip label={row.active ? 'Active' : 'Expired'} size="small" color={row.active ? 'success' : 'default'} variant="outlined" />,
  },
  { id: 'createdAt', label: 'Created', sortable: true, render: (row) => new Date(row.createdAt).toLocaleString() },
];

const filters: FilterOption[] = [
  { field: 'active', label: 'Status', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Expired' }] },
];

export default function SessionsPage() {
  const [data, setData] = useState<SessionRow[]>([]);
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
      const res = await fetch(`/api/sessions?${params}`);
      const result = await res.json();
      setData(result.data || []);
      setTotal(result.total || 0);
    } catch { setData([]); setTotal(0); }
    setLoading(false);
  }, [page, pageSize, sortBy, sortOrder, search, activeFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>Sessions</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{total} total sessions</Typography>
      <DataTable<SessionRow>
        columns={columns} data={data} total={total} page={page} pageSize={pageSize}
        loading={loading} sortBy={sortBy} sortOrder={sortOrder} search={search}
        filters={filters} activeFilters={activeFilters}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onSortChange={(s, o) => { setSortBy(s); setSortOrder(o); }}
        onSearchChange={setSearch}
        onFilterChange={(field, value) => setActiveFilters(prev => ({ ...prev, [field]: value }))}
        emptyIcon="devices" emptyTitle="No sessions found"
      />
    </Box>
  );
}
