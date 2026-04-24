'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';
import LoadingSkeleton from '@/components/LoadingSkeleton';

interface RoleRow { id: string; name: string; displayName: string; description: string; permissions: string[]; userCount: number; }

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/roles?pageSize=10')
      .then(r => r.json())
      .then(result => { setRoles(result.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton variant="table" rows={3} />;

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>Roles & Permissions</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Manage role-based access control</Typography>

      <Box sx={{ display: 'grid', gap: 3 }}>
        {roles.map(role => (
          <Card key={role.id}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="h6" fontWeight={600}>{role.displayName}</Typography>
                  <Typography variant="body2" color="text.secondary">{role.description}</Typography>
                </Box>
                <Chip label={`${role.userCount} users`} color="primary" variant="outlined" />
              </Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Permissions</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {role.permissions.map(perm => (
                  <Chip key={perm} label={perm} size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />
                ))}
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
