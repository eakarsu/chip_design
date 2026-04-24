'use client';

import LoadingSkeleton from '@/components/LoadingSkeleton';

export default function UsersLoading() {
  return <LoadingSkeleton variant="table" rows={10} />;
}
