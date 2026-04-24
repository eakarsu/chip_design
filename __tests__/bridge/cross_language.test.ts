/**
 * Cross-language hash parity test.
 *
 * Runs the Python design_state module against the same fixture this test
 * computes in TS, and asserts the SHA-256 matches. Skipped automatically
 * when the `python3` binary isn't available.
 */
import { execFileSync } from 'child_process';
import { hashSnapshot, toSnapshot } from '@/lib/bridge/design_state';
import path from 'path';

const FIXTURE = {
  id: 'des-1', name: 'Test',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  cells: [
    { id: 'u1', name: 'u1', width: 4, height: 4, position: { x: 10, y: 10 }, pins: [], type: 'standard' as const },
    { id: 'u2', name: 'u2', width: 4, height: 4, position: { x: 20, y: 20 }, pins: [], type: 'standard' as const },
  ],
  nets: [{ id: 'n1', name: 'n1', pins: ['u1.Y', 'u2.A'], weight: 1 }],
  wires: [],
  dieArea: { width: 100, height: 100 },
};

function pythonAvailable(): boolean {
  try {
    execFileSync('python3', ['-c', 'import hashlib'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

(pythonAvailable() ? describe : describe.skip)('DesignSnapshot — TS/Python hash parity', () => {
  it('sha256 matches between design_state.ts and design_state.py', () => {
    const tsHash = hashSnapshot(toSnapshot(FIXTURE));

    const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.resolve(__dirname, '../../python_backend'))})
from design_state import from_snapshot_json, hash_snapshot
raw = sys.stdin.read()
snap = from_snapshot_json(raw)
print(hash_snapshot(snap))
`;
    const snapJson = JSON.stringify(toSnapshot(FIXTURE));
    const pyOut = execFileSync('python3', ['-c', script], {
      input: snapJson, encoding: 'utf-8',
    }).trim();

    expect(pyOut).toBe(tsHash);
  });
});
