'use client';

import LoadingSkeleton from '@/components/LoadingSkeleton';

export default function AdminLoading() {
  return <LoadingSkeleton variant="dashboard" cards={8} />;
}
