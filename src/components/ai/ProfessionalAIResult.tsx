'use client';

import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import {
  AutoAwesome,
  CheckCircle,
  DataObject,
  FactCheck,
  Flag,
  Insights,
  Science,
  WarningAmber,
} from '@mui/icons-material';

type RecordValue = Record<string, unknown>;

const headlineKeys = ['headline', 'title', 'name'];
const summaryKeys = ['executiveSummary', 'summary', 'overview', 'diagnosis', 'analysis', 'result', 'message', 'documentation'];
const metaKeys = new Set(['provider', 'model', 'risk', 'confidence', 'status', 'verdict', 'success', 'promptVersion', 'reviewMode']);
const codeKeys = /(^|_)(code|verilog|vhdl|systemverilog|testbench|script|source)$/i;
const importantLists = /actions|recommendations|solutions|findings|risks|warnings|gaps|assumptions|steps|tests|issues|conflicts|suggestions|improvements|evidence/i;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b(ai|rtl|ppa|wns|tns|drc|pdk|sdc|rc|id|api|url|vhdl|gds|lvs|eco)\b/gi, word => word.toUpperCase())
    .replace(/^./, letter => letter.toUpperCase());
}

function parseResult(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const candidates = [candidate];
  const objectStart = candidate.indexOf('{');
  const objectEnd = candidate.lastIndexOf('}');
  const arrayStart = candidate.indexOf('[');
  const arrayEnd = candidate.lastIndexOf(']');
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(candidate.slice(objectStart, objectEnd + 1));
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(candidate.slice(arrayStart, arrayEnd + 1));
  for (const possibleJson of candidates) {
    if (!possibleJson.startsWith('{') && !possibleJson.startsWith('[')) continue;
    try { return JSON.parse(possibleJson); }
    catch { /* Try the next bounded JSON candidate. */ }
  }
  return value;
}

function displayScalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return String(value);
}

type ProseBlock =
  | { type: 'heading'; text: string; level: number }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'code'; language: string; content: string }
  | { type: 'divider' };

function cleanInline(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*>\s?/, '')
    .trim();
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cleanInline(cell));
}

function parseProseBlocks(text: string): ProseBlock[] {
  const normalized = text
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
  const lines = normalized.split(/\r?\n/);
  const blocks: ProseBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const raw = lines[index];
    const line = raw.trim();
    if (!line) { index += 1; continue; }

    const fence = line.match(/^```\s*([\w+-]*)/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', language: fence[1] || 'text', content: code.join('\n').trimEnd() });
      continue;
    }

    if (/^(?:-{3,}|_{3,}|\*{3,})$/.test(line)) {
      blocks.push({ type: 'divider' });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: cleanInline(heading[2]) });
      index += 1;
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    const listMatch = line.match(/^((?:\d+)[.)]|[-*•])\s+(.+)$/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]);
      const items = [cleanInline(listMatch[2])];
      index += 1;
      while (index < lines.length) {
        const next = lines[index].trim().match(/^((?:\d+)[.)]|[-*•])\s+(.+)$/);
        if (!next || /^\d/.test(next[1]) !== ordered) break;
        items.push(cleanInline(next[2]));
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next) break;
      if (/^(?:```|#{1,6}\s|[-*•]\s|\d+[.)]\s|---+$)/.test(next)) break;
      if (next.includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: cleanInline(paragraph.join(' ')) });
  }

  return blocks;
}

function Prose({ text }: { text: string }) {
  const blocks = parseProseBlocks(text);
  return <Stack gap={1.25}>{blocks.map((block, index) => {
    if (block.type === 'heading') return <Typography key={index} variant={block.level <= 2 ? 'h6' : 'subtitle1'} fontWeight={850} sx={{ mt: index ? 1 : 0 }}>{block.text}</Typography>;
    if (block.type === 'divider') return <Divider key={index} />;
    if (block.type === 'code') return <Box key={index}><Typography variant="caption" color="text.secondary" fontWeight={750}>{block.language.toUpperCase()}</Typography><Box component="pre" sx={{ m: 0, mt: 0.5, p: 1.5, borderRadius: 1, bgcolor: '#0f172a', color: '#e2e8f0', overflowX: 'auto', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 }}>{block.content}</Box></Box>;
    if (block.type === 'table') return <TableContainer key={index} component={Paper} variant="outlined" sx={{ maxWidth: '100%' }}><Table size="small"><TableHead><TableRow>{block.headers.map((header, cellIndex) => <TableCell key={cellIndex} sx={{ fontWeight: 850, bgcolor: 'action.hover', whiteSpace: 'nowrap' }}>{header}</TableCell>)}</TableRow></TableHead><TableBody>{block.rows.map((row, rowIndex) => <TableRow key={rowIndex}>{block.headers.map((_, cellIndex) => <TableCell key={cellIndex} sx={{ verticalAlign: 'top', minWidth: 120 }}>{row[cellIndex] || '—'}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>;
    if (block.type === 'list') return <List key={index} dense disablePadding>{block.items.map((item, itemIndex) => <ListItem key={`${item}-${itemIndex}`} disableGutters alignItems="flex-start"><ListItemIcon sx={{ minWidth: 34, mt: 0.25 }}>{block.ordered ? <Typography color="primary" fontWeight={850}>{itemIndex + 1}.</Typography> : <CheckCircle color="primary" fontSize="small" />}</ListItemIcon><ListItemText primary={item} primaryTypographyProps={{ variant: 'body2', lineHeight: 1.65 }} /></ListItem>)}</List>;
    return <Typography key={index} variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{block.text}</Typography>;
  })}</Stack>;
}

function MetricGrid({ value }: { value: unknown }) {
  const items = Array.isArray(value)
    ? value.flatMap(item => isRecord(item) && item.label !== undefined && item.value !== undefined ? [{ label: String(item.label), value: item.value }] : [])
    : isRecord(value) ? Object.entries(value).map(([label, metric]) => ({ label, value: metric })) : [];
  if (!items.length) return null;
  return <Grid container spacing={1.25}>{items.map((item, index) => <Grid key={`${item.label}-${index}`} size={{ xs: 12, sm: 6, md: 4 }}><Paper variant="outlined" sx={{ p: 1.5, height: '100%', bgcolor: 'action.hover' }}><Typography variant="caption" color="text.secondary">{humanize(item.label)}</Typography><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{displayScalar(item.value)}</Typography></Paper></Grid>)}</Grid>;
}

function PrimitiveList({ items, emphasis }: { items: unknown[]; emphasis?: boolean }) {
  return <List dense disablePadding>{items.map((item, index) => <ListItem key={`${displayScalar(item)}-${index}`} disableGutters alignItems="flex-start"><ListItemIcon sx={{ minWidth: 30, mt: 0.25 }}>{emphasis ? <Flag color="primary" fontSize="small" /> : <CheckCircle color="success" fontSize="small" />}</ListItemIcon><ListItemText primary={displayScalar(item)} /></ListItem>)}</List>;
}

function FieldValue({ label, value, depth = 0 }: { label: string; value: unknown; depth?: number }) {
  const parsed = parseResult(value);
  if (depth > 5) return <Typography variant="body2">Additional detail available.</Typography>;
  if (typeof parsed === 'string') {
    if (codeKeys.test(label) || parsed.includes('\nmodule ') || parsed.includes('\nentity ')) {
      return <Box component="pre" sx={{ m: 0, p: 1.5, borderRadius: 1, bgcolor: '#0f172a', color: '#e2e8f0', overflowX: 'auto', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 }}>{parsed}</Box>;
    }
    return <Prose text={parsed} />;
  }
  if (parsed === null || parsed === undefined || typeof parsed !== 'object') return <Typography variant="body2" fontWeight={650}>{displayScalar(parsed)}</Typography>;
  if (Array.isArray(parsed)) {
    if (!parsed.length) return <Typography variant="body2" color="text.secondary">None reported.</Typography>;
    if (parsed.every(item => item === null || typeof item !== 'object')) return <PrimitiveList items={parsed} emphasis={importantLists.test(label)} />;
    return <Grid container spacing={1.25}>{parsed.map((item, index) => <Grid key={`${label}-${index}`} size={{ xs: 12, md: 6 }}><Card variant="outlined" sx={{ height: '100%' }}><CardContent><Typography variant="overline" color="text.secondary">{humanize(label)} {index + 1}</Typography><FieldValue label={label} value={item} depth={depth + 1} /></CardContent></Card></Grid>)}</Grid>;
  }
  const entries = Object.entries(parsed);
  if (!entries.length) return <Typography variant="body2" color="text.secondary">No additional detail.</Typography>;
  return <Stack gap={1.25}>{entries.map(([key, item]) => <Box key={key}><Typography variant="caption" color="text.secondary" fontWeight={750}>{humanize(key)}</Typography><FieldValue label={key} value={item} depth={depth + 1} /></Box>)}</Stack>;
}

function metaChip(key: string, value: unknown): ReactNode {
  if (value === undefined || value === null || value === '') return null;
  const confidence = key === 'confidence' && typeof value === 'number'
    ? `${Math.round((value <= 1 ? value * 100 : value) * 10) / 10}% confidence`
    : null;
  const text = confidence ?? `${humanize(key)}: ${displayScalar(value)}`;
  const normalized = String(value).toLowerCase();
  const color = /critical|high|reject|hold|failed|error/.test(normalized) ? 'error' : /moderate|warning|condition|pending/.test(normalized) ? 'warning' : /low|proceed|pass|success|accepted/.test(normalized) ? 'success' : 'default';
  return <Chip key={key} size="small" label={text} color={color} variant={color === 'default' ? 'outlined' : 'filled'} />;
}

function ObjectResult({ value }: { value: RecordValue }) {
  const headlineEntry = headlineKeys.find(key => typeof value[key] === 'string' && String(value[key]).trim());
  const summaryEntry = summaryKeys.find(key => typeof value[key] === 'string' && String(value[key]).trim() && key !== headlineEntry);
  const metricsEntry = Object.entries(value).find(([key]) => /metrics|measurements|scores|statistics/i.test(key));
  const consumed = new Set([headlineEntry, summaryEntry, metricsEntry?.[0], ...metaKeys].filter(Boolean));
  const remaining = Object.entries(value).filter(([key, item]) => !consumed.has(key) && item !== undefined && item !== null && item !== '');

  return <Stack gap={2}>
    {headlineEntry && <Typography variant="h5" fontWeight={850}>{String(value[headlineEntry])}</Typography>}
    <Stack direction="row" gap={0.75} flexWrap="wrap">{[...metaKeys].map(key => metaChip(key, value[key]))}</Stack>
    {summaryEntry && <Alert icon={<Insights />} severity="info"><Prose text={String(value[summaryEntry])} /></Alert>}
    {metricsEntry && <Box><Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>{humanize(metricsEntry[0])}</Typography><MetricGrid value={metricsEntry[1]} /></Box>}
    {remaining.map(([key, item], index) => <Box key={key}>
      {index > 0 && <Divider sx={{ mb: 2 }} />}
      <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 0.75 }}>
        {importantLists.test(key) ? <FactCheck color="primary" fontSize="small" /> : codeKeys.test(key) ? <DataObject color="primary" fontSize="small" /> : <Science color="primary" fontSize="small" />}
        <Typography variant="subtitle1" fontWeight={800}>{humanize(key)}</Typography>
      </Stack>
      <FieldValue label={key} value={item} />
    </Box>)}
  </Stack>;
}

export default function ProfessionalAIResult({ title = 'AI analysis', result, compact = false, showDisclaimer = true }: {
  title?: string;
  result: unknown;
  compact?: boolean;
  showDisclaimer?: boolean;
}) {
  const parsed = parseResult(result);
  if (parsed === null || parsed === undefined || parsed === '') return null;
  const malformedStructuredText = typeof result === 'string'
    && parsed === result
    && /(?:^|\n)\s*(?:```json\s*)?[{[]/.test(result.trim());

  return <Card variant="outlined" sx={{ mt: compact ? 0 : 2, borderWidth: compact ? 1 : 2, borderColor: 'primary.main' }}>
    <CardContent sx={{ p: compact ? 1.5 : 2.5, '&:last-child': { pb: compact ? 1.5 : 2.5 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
        <Stack direction="row" gap={1} alignItems="center"><AutoAwesome color="primary" /><Typography variant={compact ? 'subtitle1' : 'h6'} fontWeight={850}>{title}</Typography></Stack>
        <Chip size="small" icon={<FactCheck />} label="Review before use" variant="outlined" />
      </Stack>
      {malformedStructuredText ? (
        <Alert severity="error">The AI provider returned an incomplete structured response. Retry the request; raw provider serialization is intentionally hidden.</Alert>
      ) : isRecord(parsed) ? <ObjectResult value={parsed} /> : <FieldValue label={title} value={parsed} />}
      {showDisclaimer && <Alert severity="warning" icon={<WarningAmber />} sx={{ mt: 2, py: 0.25 }}>
        AI output is advisory. Validate technical claims against source artifacts, tool reports, constraints, and accountable human review.
      </Alert>}
    </CardContent>
  </Card>;
}
