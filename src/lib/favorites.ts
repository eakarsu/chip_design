/**
 * Lightweight per-browser favorites store. Persists a flat list of
 * algorithm identifiers (e.g. "placement:quadratic") in localStorage.
 *
 * Subscribers are notified through the `favorites:changed` custom event
 * so Dashboard cards and catalog stars update in lockstep without
 * plumbing a React context.
 */

const KEY = 'neuralchip.favorites.v1';
const EVT = 'favorites:changed';

export type FavoriteId = `${string}:${string}`; // category:algorithm

function safeRead(): FavoriteId[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is FavoriteId => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function safeWrite(list: FavoriteId[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function listFavorites(): FavoriteId[] {
  return safeRead();
}

export function isFavorite(id: FavoriteId): boolean {
  return safeRead().includes(id);
}

export function toggleFavorite(id: FavoriteId): boolean {
  const cur = safeRead();
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  safeWrite(next);
  return next.includes(id);
}

export function subscribeFavorites(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => fn();
  window.addEventListener(EVT, handler);
  // Cross-tab sync via the storage event.
  const storageHandler = (e: StorageEvent) => { if (e.key === KEY) fn(); };
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(EVT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
