'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, TextField, Button, MenuItem, Alert, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import DetailPanel from '@/components/DetailPanel';
import LoadingSkeleton from '@/components/LoadingSkeleton';

interface UserDetail {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  avatar?: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState({ name: '', email: '', role: '', status: '' });
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/users/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          router.push('/admin/users');
          return;
        }
        setUser(data);
        setEditData({ name: data.name, email: data.email, role: data.role, status: data.status });
        setLoading(false);
      })
      .catch(() => router.push('/admin/users'));
  }, [id, router]);

  const handleEdit = async () => {
    setSaving(true);
    setEditError('');
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editData),
    });
    if (res.ok) {
      const updated = await res.json();
      setUser(updated);
      setEditOpen(false);
    } else {
      const data = await res.json();
      setEditError(data.error || 'Update failed');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
  };

  if (loading || !user) return <LoadingSkeleton variant="detail" />;

  const fields = [
    { label: 'ID', value: user.id, type: 'code' as const },
    { label: 'Name', value: user.name },
    { label: 'Email', value: user.email },
    { label: 'Role', value: user.role, type: 'chip' as const, chipColor: (user.role === 'admin' ? 'primary' : user.role === 'editor' ? 'secondary' : 'default') as any },
    { label: 'Status', value: user.status, type: 'chip' as const, chipColor: (user.status === 'active' ? 'success' : user.status === 'suspended' ? 'error' : 'warning') as any },
    { label: 'Email Verified', value: user.emailVerified ? 'Yes' : 'No', type: 'chip' as const, chipColor: (user.emailVerified ? 'success' : 'default') as any },
    { label: 'Last Login', value: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never' },
    { label: 'Created', value: new Date(user.createdAt).toLocaleString() },
    { label: 'Updated', value: new Date(user.updatedAt).toLocaleString() },
  ];

  return (
    <>
      <DetailPanel
        title={user.name}
        subtitle={user.email}
        icon="person"
        fields={fields}
        backHref="/admin/users"
        onEdit={() => setEditOpen(true)}
        onDelete={handleDelete}
        deleteWarning={`Delete user "${user.name}"? This action cannot be undone.`}
      />

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {editError && <Alert severity="error" sx={{ mb: 2 }}>{editError}</Alert>}
          <TextField fullWidth label="Name" value={editData.name} onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))} sx={{ mb: 2, mt: 1 }} />
          <TextField fullWidth label="Email" value={editData.email} onChange={(e) => setEditData(prev => ({ ...prev, email: e.target.value }))} sx={{ mb: 2 }} />
          <TextField fullWidth select label="Role" value={editData.role} onChange={(e) => setEditData(prev => ({ ...prev, role: e.target.value }))} sx={{ mb: 2 }}>
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="editor">Editor</MenuItem>
            <MenuItem value="viewer">Viewer</MenuItem>
          </TextField>
          <TextField fullWidth select label="Status" value={editData.status} onChange={(e) => setEditData(prev => ({ ...prev, status: e.target.value }))}>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
            <MenuItem value="suspended">Suspended</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEdit} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
