'use client';

import { Box, Skeleton, Card, CardContent } from '@mui/material';

type SkeletonVariant = 'table' | 'card' | 'detail' | 'form' | 'dashboard';

interface LoadingSkeletonProps {
  variant?: SkeletonVariant;
  rows?: number;
  cards?: number;
}

function TableSkeleton({ rows = 5 }: { rows: number }) {
  return (
    <Box>
      <Skeleton variant="rectangular" height={56} sx={{ mb: 1, borderRadius: 1 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} variant="rectangular" height={52} sx={{ mb: 0.5, borderRadius: 1 }} />
      ))}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 1 }}>
        <Skeleton variant="rectangular" width={100} height={32} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" width={200} height={32} sx={{ borderRadius: 1 }} />
      </Box>
    </Box>
  );
}

function CardSkeleton({ cards = 4 }: { cards: number }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 3 }}>
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i}>
          <CardContent>
            <Skeleton variant="circular" width={48} height={48} sx={{ mb: 2 }} />
            <Skeleton variant="text" width="60%" height={32} />
            <Skeleton variant="text" width="40%" height={24} sx={{ mb: 1 }} />
            <Skeleton variant="text" width="80%" />
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

function DetailSkeleton() {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Skeleton variant="circular" width={64} height={64} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="40%" height={32} />
            <Skeleton variant="text" width="25%" height={24} />
          </Box>
        </Box>
        {Array.from({ length: 6 }).map((_, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Skeleton variant="text" width="30%" height={24} />
            <Skeleton variant="text" width="50%" height={24} />
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}

function FormSkeleton() {
  return (
    <Card>
      <CardContent>
        <Skeleton variant="text" width="30%" height={32} sx={{ mb: 3 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={56} sx={{ mb: 2, borderRadius: 1 }} />
        ))}
        <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
          <Skeleton variant="rectangular" width={100} height={40} sx={{ borderRadius: 2 }} />
          <Skeleton variant="rectangular" width={100} height={40} sx={{ borderRadius: 2 }} />
        </Box>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton({ cards = 8 }: { cards: number }) {
  return (
    <Box>
      <Skeleton variant="text" width="25%" height={40} sx={{ mb: 1 }} />
      <Skeleton variant="text" width="40%" height={24} sx={{ mb: 3 }} />
      <CardSkeleton cards={cards} />
    </Box>
  );
}

export default function LoadingSkeleton({ variant = 'table', rows = 5, cards = 4 }: LoadingSkeletonProps) {
  switch (variant) {
    case 'table': return <TableSkeleton rows={rows} />;
    case 'card': return <CardSkeleton cards={cards} />;
    case 'detail': return <DetailSkeleton />;
    case 'form': return <FormSkeleton />;
    case 'dashboard': return <DashboardSkeleton cards={cards} />;
  }
}
