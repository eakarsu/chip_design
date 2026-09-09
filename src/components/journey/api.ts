export async function journeyApi<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || result.error || 'Project request failed');
  return result as T;
}
