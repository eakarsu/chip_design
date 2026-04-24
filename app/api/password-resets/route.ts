export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { passwordResets } from '@/lib/db';
import { handleApiError } from '@/lib/middleware/errorHandler';
import { sanitizeSearchParam } from '@/lib/middleware/sanitize';
import type { QueryOptions } from '@/lib/db/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const options: QueryOptions = {
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '10'),
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
      search: sanitizeSearchParam(searchParams.get('search')),
      filters: {},
    };

    const status = searchParams.get('status');
    if (status) options.filters!.status = status;

    return NextResponse.json(passwordResets.list(options));
  } catch (error) {
    return handleApiError(error);
  }
}
