'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Chip, Button } from '@mui/material';
import { useRouter } from 'next/navigation';
import DataTable, { Column, FilterOption } from '@/components/DataTable';
import ConfirmDialog from '@/components/ConfirmDialog';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

const roleColors: Record<string, 'primary' | 'secondary' | 'default'> = {
  admin: 'primary',
  editor: 'secondary',
  viewer: 'default',
};

const statusColors: Record<string, 'success' | 'warning' | 'error'> = {
  active: 'success',
  inactive: 'warning',
  suspended: 'error',
};

const columns: Column<UserRow>[] = [
  { id: 'name', label: 'Name', sortable: true, minWidth: 150 },
  { id: 'email', label: 'Email', sortable: true, minWidth: 200 },
  {
    id: 'role',
    label: 'Role',
    sortable: true,
    render: (row) => <Chip label={row.role} size="small" color={roleColors[row.role] || 'default'} />,
  },
  {
    id: 'status',
    label: 'Status',
    sortable: true,
    render: (row) => <Chip label={row.status} size="small" color={statusColors[row.status] || 'default'} variant="outlined" />,
  },
  {
    id: 'emailVerified',
    label: 'Verified',
    render: (row) => (
      <span className="material-symbols-outlined" style={{ fontSize: 20, color: row.emailVerified ? '#16A34A' : '#9CA3AF' }}>
        {row.emailVerified ? 'check_circle' : 'cancel'}
      </span>
    ),
  },
  {
    id: 'createdAt',
    label: 'Created',
    sortable: true,
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
];

const filters: FilterOption[] = [
  { field: 'role', label: 'Role', options: [{ value: 'admin', label: 'Admin' }, { value: 'editor', label: 'Editor' }, { value: 'viewer', label: 'Viewer' }] },
  { field: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'suspended', label: 'Suspended' }] },
];

export default function UsersPage() {
  const router = useRouter();
  const [data, setData] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortOrder,
    });
    if (search) params.set('search', search);
    Object.entries(activeFilters).forEach(([k, v]) => { if (v) params.set(k, v); });

    try {
      const res = await fetch(`/api/users?${params}`);
      const result = await res.json();
      setData(result.data || []);
      setTotal(result.total || 0);
    } catch {
      setData([]);
      setTotal(0);
    }
    setLoading(false);
  }, [page, pageSize, sortBy, sortOrder, search, activeFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBulkDelete = async (ids: string[]) => {
    setBulkDeleteConfirm(ids);
  };

  const confirmBulkDelete = async () => {
    await fetch('/api/users/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', ids: bulkDeleteConfirm }),
    });
    setBulkDeleteConfirm([]);
    fetchData();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Users</Typography>
          <Typography variant="body2" color="text.secondary">{total} total users</Typography>
        </Box>
      </Box>

      <DataTable<UserRow>
        columns={columns}
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        search={search}
        filters={filters}
        activeFilters={activeFilters}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onSortChange={(s, o) => { setSortBy(s); setSortOrder(o); }}
        onSearchChange={setSearch}
        onFilterChange={(field, value) => setActiveFilters(prev => ({ ...prev, [field]: value }))}
        onBulkDelete={handleBulkDelete}
        rowHref={(row) => `/admin/users/${row.id}`}
        emptyIcon="group"
        emptyTitle="No users found"
      />

      <ConfirmDialog
        open={bulkDeleteConfirm.length > 0}
        title="Delete Users"
        message={`Are you sure you want to delete ${bulkDeleteConfirm.length} user(s)? This cannot be undone.`}
        confirmLabel="Delete"
        severity="error"
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDeleteConfirm([])}
      />
    </Box>
  );
}
