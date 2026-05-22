'use client';
import React from 'react';

const trend = [21, 34, 30, 49, 45, 61, 75, 69, 84, 91];
const maxTrend = Math.max(...trend);
const points = trend.map((value, index) => {
  const x = 28 + index * 48;
  const y = 178 - (value / maxTrend) * 136;
  return `${x},${y}`;
}).join(' ');

function TimelineView() {
  return (
    <main style={{ padding: 24, color: '#172033' }}>
      <p style={{ margin: 0, color: '#64748b', fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Custom visualization</p>
      <h1 style={{ margin: '6px 0 18px', fontSize: 30 }}>chip design Insight Map</h1>
      <svg viewBox="0 0 520 230" role="img" aria-label="Custom operational trend visualization" style={{ width: '100%', maxWidth: 900, height: 300, border: '1px solid #d7dde8', borderRadius: 8, background: '#f8fafc' }}>
        {[42, 76, 110, 144, 178].map((y) => <line key={y} x1="28" x2="492" y1={y} y2={y} stroke="#e2e8f0" />)}
        <polyline points={points} fill="none" stroke="#0f766e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {trend.map((value, index) => {
          const x = 28 + index * 48;
          const y = 178 - (value / maxTrend) * 136;
          return <circle key={index} cx={x} cy={y} r="5" fill="#14b8a6" stroke="#fff" strokeWidth="2" />;
        })}
      </svg>
    </main>
  );
}


export default function CodexCustomVizFeature() {
  return <TimelineView />;
}
