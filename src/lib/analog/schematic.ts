/**
 * Schematic rendering and export helpers.
 *
 * EasyEDA/PSpice automation is not available in this environment, so the
 * studio produces an engineer-reviewable SVG schematic, a SPICE netlist, a
 * wiring list and a BOM CSV. These are honest exports of the calculated
 * design — not a claim that a vendor EDA tool was driven.
 */
import type { BuckDesign, Requirements } from './types';

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderSchematicSvg(requirements: Requirements, design: BuckDesign): string {
  const parts = design.billOfMaterials;
  const inductor = parts.find((item) => item.kind === 'inductor');
  const outCap = parts.find((item) => item.kind === 'output-capacitor');
  const inCap = parts.find((item) => item.kind === 'input-capacitor');
  const diode = parts.find((item) => item.kind === 'diode');
  const label = (x: number, y: number, text: string, size = 12, anchor = 'start', weight = 'normal') =>
    `<text x="${x}" y="${y}" font-family="Inter, Arial, sans-serif" font-size="${size}" fill="#0f172a" text-anchor="${anchor}" font-weight="${weight}">${esc(text)}</text>`;
  const box = (x: number, y: number, w: number, h: number, title: string, subtitle: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#f8fafc" stroke="#334155" stroke-width="1.5"/>` +
    label(x + 10, y + 20, title, 12, 'start', 'bold') +
    label(x + 10, y + 38, subtitle, 10) ;
  const wire = (x1: number, y1: number, x2: number, y2: number, name?: string) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0f172a" stroke-width="1.5"/>` +
    (name ? label((x1 + x2) / 2, (y1 + y2) / 2 - 4, name, 10, 'middle') : '');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 520" width="100%" role="img" aria-label="Buck converter schematic">
  <rect width="960" height="520" fill="#ffffff"/>
  ${label(24, 32, `Buck converter — ${design.ic.part}`, 18, 'start', 'bold')}
  ${label(24, 52, `Vin ${requirements.vinMin}–${requirements.vinMax} V · Vout ${requirements.vout} V · Iout ${requirements.ioutMax} A · fsw ${(design.fswHz / 1000).toFixed(0)} kHz`, 12)}
  ${box(40, 90, 150, 70, 'Input', `${inCap ? inCap.value : 'Cin'} ${inCap ? inCap.part : ''}`)}
  ${box(300, 90, 190, 120, design.ic.part, `${design.ic.topology} · ${design.ic.packageName}`)}
  ${box(600, 80, 150, 80, 'Inductor', `${inductor ? inductor.value : ''} ${inductor ? inductor.part : ''}`)}
  ${box(600, 220, 150, 80, 'Output cap', `${outCap ? outCap.value : ''} ${outCap ? outCap.part : ''}`)}
  ${diode ? box(300, 260, 190, 70, 'Freewheel diode', `${diode.part} · ${diode.rated}`) : box(300, 260, 190, 70, 'Low-side switch', 'Integrated (synchronous)')}
  ${box(800, 150, 130, 90, 'Load', `${requirements.vout} V / ${requirements.ioutMax} A`)}
  ${wire(190, 125, 300, 125, 'VIN')}
  ${wire(490, 140, 600, 120, 'SW')}
  ${wire(750, 120, 800, 120)}
  ${wire(800, 120, 800, 150, 'VOUT')}
  ${wire(750, 260, 800, 260)}
  ${wire(800, 240, 800, 260)}
  ${wire(240, 160, 240, 295)}
  ${wire(240, 295, 300, 295, 'GND')}
  ${wire(490, 200, 520, 200)}
  ${wire(520, 200, 520, 300)}
  ${wire(520, 300, 600, 300, 'FB divider')}
  ${label(24, 480, 'Generated from calculated values. Review before fabrication; not a vendor-EDA export.', 11)}
</svg>`;
}

export function exportBomCsv(design: BuckDesign): string {
  const header = ['Kind', 'Part', 'Vendor', 'Value', 'Rated', 'Key parameters', 'Reason'];
  const rows = design.billOfMaterials.map((item) => [
    item.kind,
    item.part,
    item.vendor,
    item.value,
    item.rated,
    Object.entries(item.keyParams).map(([key, value]) => `${key}=${value}`).join('; '),
    item.reason,
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function exportWiringList(requirements: Requirements, design: BuckDesign): string {
  const lines = [
    'Net,Connection A,Connection B,Note',
    `VIN,Input supply +,${design.ic.part} VIN,${requirements.vinMin}–${requirements.vinMax} V`,
    `SW,${design.ic.part} SW,Inductor L1,Keep this node short and away from FB`,
    `VOUT,Inductor L1 output,Output capacitor +,${requirements.vout} V`,
    `FB,Output divider tap,${design.ic.part} FB,${design.feedbackR1Ohm} Ω / ${design.feedbackR2Ohm} Ω`,
    `COMP,Compensator,${design.ic.part} COMP,Rc=${design.compensation.rcOhm} Ω Cc=${design.compensation.ccF} F`,
    'GND,All grounds,Return plane,Star the input capacitor return at the IC GND',
  ];
  return lines.join('\n');
}
