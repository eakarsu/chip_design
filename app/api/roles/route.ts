export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { roles } from '@/lib/db';
import { handleApiError } from '@/lib/middleware/errorHandler';
import type { QueryOptions } from '@/lib/db/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const options: QueryOptions = {
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '10'),
      sortBy: searchParams.get('sortBy') || 'name',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc',
    };

    return NextResponse.json(roles.list(options));
  } catch (error) {
    return handleApiError(error);
  }
}
