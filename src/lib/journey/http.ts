import 'server-only';

export async function journeyBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length') || 0) > 1_100_000) throw new Error('Request exceeds the 1 MB limit');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('A JSON body is required');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 1_100_000) {
      await reader.cancel();
      throw new Error('Request exceeds the 1 MB limit');
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
