export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auditLogs } from '@/lib/db';
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

    const action = searchParams.get('action');
    if (action) options.filters!.action = action;

    return NextResponse.json(auditLogs.list(options));
  } catch (error) {
    return handleApiError(error);
  }
}
