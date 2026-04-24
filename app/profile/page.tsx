'use client';

import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert, Container, Divider, Avatar,
} from '@mui/material';
import { useAuth } from '@/lib/auth/context';
import { useRouter } from 'next/navigation';
import { checkPasswordStrength } from '@/lib/auth/password';
import PasswordStrengthComponent from '@/components/PasswordStrength';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, updateUser } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = newPassword ? checkPasswordStrength(newPassword) : null;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user, isLoading, isAuthenticated, router]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/users/${user?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });

      if (res.ok) {
        const data = await res.json();
        updateUser({ ...user!, name: data.name, email: data.email });
        setProfileMsg({ type: 'success', text: 'Profile updated' });
      } else {
        const data = await res.json();
        setProfileMsg({ type: 'error', text: data.error || 'Update failed' });
      }
    } catch {
      setProfileMsg({ type: 'error', text: 'Network error' });
    }
    setLoading(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        setPasswordMsg({ type: 'success', text: 'Password changed' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const data = await res.json();
        setPasswordMsg({ type: 'error', text: data.error || 'Change failed' });
      }
    } catch {
      setPasswordMsg({ type: 'error', text: 'Network error' });
    }
    setLoading(false);
  };

  if (isLoading || !user) return null;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 4 }}>
        Profile Settings
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <Avatar sx={{ width: 64, height: 64, bgcolor: 'primary.main', fontSize: 28 }}>
              {user.name.charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="h6">{user.name}</Typography>
              <Typography variant="body2" color="text.secondary">{user.email}</Typography>
            </Box>
          </Box>

          {profileMsg && <Alert severity={profileMsg.type} sx={{ mb: 2 }}>{profileMsg.text}</Alert>}

          <Box component="form" onSubmit={handleProfileUpdate}>
            <TextField fullWidth label="Name" value={name} onChange={(e) => setName(e.target.value)} required sx={{ mb: 2 }} />
            <TextField fullWidth label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required sx={{ mb: 3 }} />
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Change Password</Typography>
          <Divider sx={{ mb: 3 }} />

          {passwordMsg && <Alert severity={passwordMsg.type} sx={{ mb: 2 }}>{passwordMsg.text}</Alert>}

          <Box component="form" onSubmit={handlePasswordChange}>
            <TextField fullWidth label="Current Password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required sx={{ mb: 2 }} />
            <TextField fullWidth label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required sx={{ mb: 1 }} />
            {strength && <PasswordStrengthComponent strength={strength} />}
            <TextField fullWidth label="Confirm New Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required sx={{ mb: 3, mt: 2 }} />
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? 'Changing...' : 'Change Password'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}
