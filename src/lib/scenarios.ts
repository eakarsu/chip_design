/**
 * Saved "scenarios" — a named snapshot of (category, algorithm, problem-size
 * parameters) that the user can re-load from the Algorithms page. Persisted
 * in localStorage so it survives reloads without a backend table.
 *
 * Subscribers are notified via a `scenarios:changed` CustomEvent so the
 * Load-Scenario dialog updates in real time after a save.
 */

const KEY = 'neuralchip.scenarios.v1';
const EVT = 'scenarios:changed';

export interface ScenarioParams {
  chipWidth: number;
  chipHeight: number;
  cellCount: number;
  netCount: number;
  iterations: number;
}

export interface Scenario {
  id: string;
  name: string;
  category: string;
  algorithm: string;
  parameters: ScenarioParams;
  createdAt: number;
  updatedAt: number;
}

function safeRead(): Scenario[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(list: Scenario[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function listScenarios(): Scenario[] {
  return safeRead().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveScenario(input: Omit<Scenario, 'id' | 'createdAt' | 'updatedAt'>): Scenario {
  const now = Date.now();
  const cur = safeRead();
  // Treat duplicate names (case-insensitive) as updates so repeated saves
  // don't flood the list.
  const existing = cur.find(s => s.name.toLowerCase() === input.name.toLowerCase());
  if (existing) {
    const updated: Scenario = { ...existing, ...input, updatedAt: now };
    safeWrite(cur.map(s => (s.id === existing.id ? updated : s)));
    return updated;
  }
  const created: Scenario = {
    ...input,
    id: `sc_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  safeWrite([created, ...cur]);
  return created;
}

export function deleteScenario(id: string) {
  safeWrite(safeRead().filter(s => s.id !== id));
}

export function subscribeScenarios(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => fn();
  window.addEventListener(EVT, handler);
  const storageHandler = (e: StorageEvent) => { if (e.key === KEY) fn(); };
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(EVT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
