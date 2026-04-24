import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

interface ApiError {
  status: number;
  message: string;
  errors?: Record<string, string[]>;
}

export function createApiError(status: number, message: string, errors?: Record<string, string[]>): ApiError {
  return { status, message, errors };
}

export function handleApiError(error: unknown): NextResponse {
  console.error('[API Error]', error);

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    error.errors.forEach((err) => {
      const path = err.path.join('.');
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(err.message);
    });
    return NextResponse.json(
      { error: 'Validation failed', errors: fieldErrors },
      { status: 400 }
    );
  }

  if (error && typeof error === 'object' && 'status' in error) {
    const apiError = error as ApiError;
    return NextResponse.json(
      { error: apiError.message, errors: apiError.errors },
      { status: apiError.status }
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}

export function withErrorHandler(
  handler: (req: Request) => Promise<NextResponse>
) {
  return async (req: Request): Promise<NextResponse> => {
    try {
      return await handler(req);
    } catch (error) {
      return handleApiError(error);
    }
  };
}
