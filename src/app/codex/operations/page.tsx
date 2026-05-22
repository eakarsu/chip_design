'use client';
import React, { useMemo, useState } from 'react';

const starter = [
  { id: 1, task: 'Review priority queue', owner: 'Ops', status: 'Ready' },
  { id: 2, task: 'Prepare customer follow-up', owner: 'AI', status: 'Drafting' },
  { id: 3, task: 'Attach evidence packet', owner: 'Audit', status: 'Queued' },
];

export default function CodexOperationsFeature() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState(starter);
  const visible = useMemo(() => items.filter((item) => Object.values(item).join(' ').toLowerCase().includes(query.toLowerCase())), [items, query]);
  return (
    <main style={{ padding: 24, color: '#172033' }}>
      <p style={{ margin: 0, color: '#64748b', fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Non-visual workflow</p>
      <h1 style={{ margin: '6px 0 18px', fontSize: 30 }}>chip design Operations Desk</h1>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workflow items" style={{ width: '100%', maxWidth: 720, padding: 12, border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 16 }} />
      <div style={{ maxWidth: 920, border: '1px solid #d7dde8', borderRadius: 8, overflow: 'hidden' }}>
        {visible.map((item) => (
          <button key={item.id} type="button" onClick={() => setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: row.status === 'Done' ? 'Ready' : 'Done' } : row))} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: 12, width: '100%', padding: 14, border: 0, borderBottom: '1px solid #e2e8f0', background: '#fff', textAlign: 'left' }}>
            <strong>{item.task}</strong><span>{item.owner}</span><span>{item.status}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
