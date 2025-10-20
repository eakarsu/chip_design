import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rateLimit';

// Validation schema
const aiRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
  model: z.string().optional().default('anthropic/claude-3.5-sonnet'),
  temperature: z.number().min(0).max(2).optional().default(1),
  max_tokens: z.number().min(1).max(4096).optional().default(1024),
  stream: z.boolean().optional().default(false),
});

type AIRequest = z.infer<typeof aiRequestSchema>;

// Environment validation
function validateEnv() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  return { apiKey, baseUrl };
}

// Get client identifier for rate limiting
function getClientId(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
  return ip;
}

// Log abuse attempt
function logAbuse(clientId: string, reason: string) {
  const timestamp = new Date().toISOString();
  console.warn(`[ABUSE] ${timestamp} - Client: ${clientId} - Reason: ${reason}`);
  // In production, send to monitoring service
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = getClientId(request);
    const rateLimitResult = rateLimit(clientId, {
      windowMs: 60000, // 1 minute
      maxRequests: 10, // 10 requests per minute
    });

    if (!rateLimitResult.allowed) {
      logAbuse(clientId, 'Rate limit exceeded');
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
            'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    // CORS check
    const origin = request.headers.get('origin') || '';
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

    if (allowedOrigins[0] !== '*' && !allowedOrigins.includes(origin)) {
      logAbuse(clientId, `Unauthorized origin: ${origin}`);
      return NextResponse.json(
        { error: 'Unauthorized origin' },
        { status: 403 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const validatedData: AIRequest = aiRequestSchema.parse(body);

    // Validate environment
    const { apiKey, baseUrl } = validateEnv();

    // Input validation - check for abuse
    const totalLength = validatedData.messages.reduce((sum, msg) => sum + msg.content.length, 0);
    if (totalLength > 10000) {
      logAbuse(clientId, `Excessive input length: ${totalLength}`);
      return NextResponse.json(
        { error: 'Input too long', message: 'Total message length exceeds 10,000 characters' },
        { status: 400 }
      );
    }

    // Make request to OpenRouter
    const openrouterResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://neuralchip.ai',
        'X-Title': 'NeuralChip AI Platform',
      },
      body: JSON.stringify({
        model: validatedData.model,
        messages: validatedData.messages,
        temperature: validatedData.temperature,
        max_tokens: validatedData.max_tokens,
        stream: validatedData.stream,
      }),
    });

    if (!openrouterResponse.ok) {
      const errorText = await openrouterResponse.text();
      console.error('OpenRouter API error:', errorText);
      return NextResponse.json(
        {
          error: 'AI service error',
          message: 'Failed to process AI request',
          details: process.env.NODE_ENV === 'development' ? errorText : undefined,
        },
        { status: openrouterResponse.status }
      );
    }

    // Handle streaming response
    if (validatedData.stream) {
      // For streaming, we need to return a ReadableStream
      const reader = openrouterResponse.body?.getReader();
      if (!reader) {
        return NextResponse.json(
          { error: 'Streaming not available' },
          { status: 500 }
        );
      }

      const stream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        },
      });
    }

    // Handle non-streaming response
    const data = await openrouterResponse.json();

    return NextResponse.json(data, {
      headers: {
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
      },
    });

  } catch (error) {
    console.error('API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          message: 'Request validation failed',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

  if (allowedOrigins[0] === '*' || allowedOrigins.includes(origin)) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigins[0] === '*' ? '*' : origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  return new NextResponse(null, { status: 403 });
}
