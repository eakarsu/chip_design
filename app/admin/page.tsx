'use client';

import { useState, useEffect } from 'react';
import { Box, Card, CardContent, CardActionArea, Typography, Grid } from '@mui/material';
import { useRouter } from 'next/navigation';
import LoadingSkeleton from '@/components/LoadingSkeleton';

interface DashboardCard {
  title: string;
  icon: string;
  count: number | null;
  description: string;
  href: string;
  color: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const responses = await Promise.all([
          fetch('/api/users?pageSize=1'),
          fetch('/api/sessions?pageSize=1'),
          fetch('/api/audit-logs?pageSize=1'),
          fetch('/api/password-resets?pageSize=1'),
          fetch('/api/email-verifications?pageSize=1'),
          fetch('/api/error-logs?pageSize=1'),
          fetch('/api/roles?pageSize=1'),
        ]);
        const data = await Promise.all(responses.map(r => r.json()));
        setStats({
          users: data[0].total || 0,
          sessions: data[1].total || 0,
          auditLogs: data[2].total || 0,
          passwordResets: data[3].total || 0,
          emailVerifications: data[4].total || 0,
          errorLogs: data[5].total || 0,
          roles: data[6].total || 0,
        });
      } catch {
        setStats({ users: 0, sessions: 0, auditLogs: 0, passwordResets: 0, emailVerifications: 0, errorLogs: 0, roles: 0 });
      }
      setLoading(false);
    }
    fetchStats();
  }, []);

  if (loading) return <LoadingSkeleton variant="dashboard" cards={8} />;

  const cards: DashboardCard[] = [
    { title: 'Users', icon: 'group', count: stats?.users ?? null, description: 'Manage user accounts and roles', href: '/admin/users', color: '#4F46E5' },
    { title: 'Sessions', icon: 'devices', count: stats?.sessions ?? null, description: 'Active and expired sessions', href: '/admin/sessions', color: '#06B6D4' },
    { title: 'Audit Logs', icon: 'history', count: stats?.auditLogs ?? null, description: 'Track system activity', href: '/admin/audit-logs', color: '#8B5CF6' },
    { title: 'Password Resets', icon: 'lock_reset', count: stats?.passwordResets ?? null, description: 'Password reset requests', href: '/admin/password-resets', color: '#F59E0B' },
    { title: 'Email Verifications', icon: 'mark_email_read', count: stats?.emailVerifications ?? null, description: 'Email verification status', href: '/admin/email-verifications', color: '#10B981' },
    { title: 'Error Logs', icon: 'bug_report', count: stats?.errorLogs ?? null, description: 'Monitor system errors', href: '/admin/error-logs', color: '#EF4444' },
    { title: 'Roles & Permissions', icon: 'admin_panel_settings', count: stats?.roles ?? null, description: 'RBAC configuration', href: '/admin/roles', color: '#EC4899' },
    { title: 'Security', icon: 'security', count: null, description: 'Security headers & sanitization', href: '/admin/security', color: '#14B8A6' },
  ];

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
        Admin Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Manage your platform from a single view
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 3 }}>
        {cards.map((card) => (
          <Card key={card.title}>
            <CardActionArea onClick={() => router.push(card.href)} sx={{ height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: `${card.color}15`,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: card.color }}>
                      {card.icon}
                    </span>
                  </Box>
                  {card.count !== null && (
                    <Typography variant="h4" fontWeight={700} sx={{ color: card.color }}>
                      {card.count}
                    </Typography>
                  )}
                </Box>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
                  {card.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {card.description}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
