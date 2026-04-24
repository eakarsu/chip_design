'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import DataTable, { Column, FilterOption } from '@/components/DataTable';

interface ResetRow { id: string; userEmail: string; status: string; expiresAt: string; usedAt?: string; createdAt: string; }

const statusColors: Record<string, 'warning' | 'success' | 'error'> = { pending: 'warning', used: 'success', expired: 'error' };

const columns: Column<ResetRow>[] = [
  { id: 'id', label: 'ID', sortable: true },
  { id: 'userEmail', label: 'Email', sortable: true, minWidth: 200 },
  { id: 'status', label: 'Status', sortable: true, render: (row) => <Chip label={row.status} size="small" color={statusColors[row.status] || 'default'} /> },
  { id: 'expiresAt', label: 'Expires', sortable: true, render: (row) => new Date(row.expiresAt).toLocaleString() },
  { id: 'usedAt', label: 'Used At', render: (row) => row.usedAt ? new Date(row.usedAt).toLocaleString() : '—' },
  { id: 'createdAt', label: 'Created', sortable: true, render: (row) => new Date(row.createdAt).toLocaleString() },
];

const filters: FilterOption[] = [
  { field: 'status', label: 'Status', options: [{ value: 'pending', label: 'Pending' }, { value: 'used', label: 'Used' }, { value: 'expired', label: 'Expired' }] },
];

export default function PasswordResetsPage() {
  const [data, setData] = useState<ResetRow[]>([]);
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
      const res = await fetch(`/api/password-resets?${params}`);
      const result = await res.json();
      setData(result.data || []); setTotal(result.total || 0);
    } catch { setData([]); setTotal(0); }
    setLoading(false);
  }, [page, pageSize, sortBy, sortOrder, search, activeFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>Password Resets</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{total} total requests</Typography>
      <DataTable<ResetRow>
        columns={columns} data={data} total={total} page={page} pageSize={pageSize}
        loading={loading} sortBy={sortBy} sortOrder={sortOrder} search={search}
        filters={filters} activeFilters={activeFilters}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onSortChange={(s, o) => { setSortBy(s); setSortOrder(o); }}
        onSearchChange={setSearch}
        onFilterChange={(field, value) => setActiveFilters(prev => ({ ...prev, [field]: value }))}
        emptyIcon="lock_reset" emptyTitle="No password resets found"
      />
    </Box>
  );
}
