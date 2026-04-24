'use client';

import { Box, Card, CardContent, Typography, Button, Chip, Divider } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

interface Field {
  label: string;
  value: React.ReactNode;
  type?: 'text' | 'chip' | 'date' | 'code';
  chipColor?: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
}

interface DetailPanelProps {
  title: string;
  subtitle?: string;
  icon?: string;
  fields: Field[];
  backHref: string;
  onEdit?: () => void;
  onDelete?: () => Promise<void>;
  deleteWarning?: string;
  children?: React.ReactNode;
}

export default function DetailPanel({
  title,
  subtitle,
  icon,
  fields,
  backHref,
  onEdit,
  onDelete,
  deleteWarning = 'This action cannot be undone.',
  children,
}: DetailPanelProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
      router.push(backHref);
    } catch {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          onClick={() => router.push(backHref)}
          startIcon={
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              arrow_back
            </span>
          }
          sx={{ color: 'text.secondary' }}
        >
          Back
        </Button>
      </Box>
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {icon && (
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                  }}
                >
                  <span className="material-symbols-outlined">{icon}</span>
                </Box>
              )}
              <Box>
                <Typography variant="h5" fontWeight={600}>
                  {title}
                </Typography>
                {subtitle && (
                  <Typography variant="body2" color="text.secondary">
                    {subtitle}
                  </Typography>
                )}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {onEdit && (
                <Button
                  variant="outlined"
                  onClick={onEdit}
                  startIcon={
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      edit
                    </span>
                  }
                >
                  Edit
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => setDeleteOpen(true)}
                  startIcon={
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      delete
                    </span>
                  }
                >
                  Delete
                </Button>
              )}
            </Box>
          </Box>
          <Divider sx={{ mb: 3 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
            {fields.map((field, i) => (
              <Box key={i}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                  {field.label}
                </Typography>
                {field.type === 'chip' ? (
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      label={field.value}
                      size="small"
                      color={field.chipColor || 'default'}
                    />
                  </Box>
                ) : field.type === 'code' ? (
                  <Typography
                    variant="body2"
                    sx={{
                      mt: 0.5,
                      fontFamily: '"JetBrains Mono", monospace',
                      bgcolor: 'action.hover',
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      fontSize: '0.8rem',
                      wordBreak: 'break-all',
                    }}
                  >
                    {field.value}
                  </Typography>
                ) : (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {field.value || '—'}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
          {children}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={deleteOpen}
        title="Confirm Delete"
        message={deleteWarning}
        confirmLabel="Delete"
        severity="error"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        loading={deleting}
      />
    </>
  );
}
