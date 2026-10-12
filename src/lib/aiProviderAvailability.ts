import { NextResponse } from 'next/server';

export class AiProviderUnavailable extends Error {
  constructor() {
    super('The AI provider is unavailable. Your input was not processed; please try again later.');
    this.name = 'AiProviderUnavailable';
  }
}

export async function fetchAiProvider(input: string, init: RequestInit): Promise<Response> {
  if (!process.env.OPENROUTER_BASE_URL || !process.env.OPENROUTER_API_KEY) {
    throw new AiProviderUnavailable();
  }
  try {
    const response = await fetch(input, init);
    if (!response.ok) throw new AiProviderUnavailable();
    return response;
  } catch (error) {
    if (error instanceof AiProviderUnavailable) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new AiProviderUnavailable();
  }
}

export function providerUnavailableResult(error: unknown): NextResponse | null {
  return error instanceof AiProviderUnavailable
    ? NextResponse.json({ unavailable: true, message: error.message })
    : null;
}
