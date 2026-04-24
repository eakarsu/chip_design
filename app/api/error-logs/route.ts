export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { errorLogs } from '@/lib/db';
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

    const severity = searchParams.get('severity');
    if (severity) options.filters!.severity = severity;
    const resolved = searchParams.get('resolved');
    if (resolved) options.filters!.resolved = resolved === 'true';

    return NextResponse.json(errorLogs.list(options));
  } catch (error) {
    return handleApiError(error);
  }
}
