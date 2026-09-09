'use client';

import { useState } from 'react';
import { Alert, Box, MenuItem, Slider, Stack, TextField, Typography } from '@mui/material';
import { valueAt, type Waveform } from '@/lib/journey/waveform';

function displayValue(value: string, width: number): string {
  if (/^[01]+$/.test(value) && value.length <= 128)
    return width === 1 ? value : `0x${BigInt(`0b${value}`).toString(16)}`;
  return value.slice(0, 32);
}

export default function WaveformViewer({ waveform }: { waveform: Waveform }) {
  const [selected, setSelected] = useState(() => {
    const controls = waveform.signals.filter((item) =>
      /(?:^|\.)(clk|rst_n|reset_n|start|valid|busy|result|in_valid|in_ready|out_valid|out_ready|in_data|out_data)\b/.test(
        item.name
      )
    );
    return [...new Set([...controls, ...waveform.signals].map((item) => item.id))].slice(0, 10);
  });
  const [window, setWindow] = useState<number[]>([0, 100]);
  const [cursor, setCursor] = useState(0);
  const total = Math.max(1, waveform.endTime);
  const start = (total * window[0]) / 100,
    end = (total * window[1]) / 100;
  const span = Math.max(1, end - start);
  const signals = waveform.signals.filter((item) => selected.includes(item.id)).slice(0, 12);
  return (
    <Stack gap={2}>
      <Typography variant="h6">Waveform / counterexample</Typography>
      {waveform.truncated && (
        <Alert severity="info">
          Preview is bounded to the first available signals and transitions. Download the VCD for full analysis.
        </Alert>
      )}
      <TextField
        select
        label="Signals (up to 12)"
        SelectProps={{ multiple: true }}
        value={selected}
        onChange={(event) =>
          setSelected(
            (typeof event.target.value === 'string'
              ? event.target.value.split(',')
              : (event.target.value as string[])
            ).slice(0, 12)
          )
        }
      >
        {waveform.signals.map((item) => (
          <MenuItem key={item.id} value={item.id}>
            {item.name}
          </MenuItem>
        ))}
      </TextField>
      <Typography variant="caption">
        Visible time window · {Math.round(start)}–{Math.round(end)} ticks · timescale {waveform.timescale}
      </Typography>
      <Slider
        aria-label="Waveform time window"
        value={window}
        onChange={(_, value) => {
          const range = value as number[];
          if (range[1] - range[0] >= 0.1) setWindow(range);
        }}
        min={0}
        max={100}
        step={0.1}
        valueLabelDisplay="auto"
      />
      <Box sx={{ overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <svg
          viewBox={`0 0 1000 ${Math.max(55, signals.length * 54)}`}
          style={{ width: '100%', minWidth: 700, display: 'block', background: '#0a192f' }}
          role="img"
          aria-label="Digital signal values over time"
        >
          {signals.map((signal, index) => {
            const y = index * 54;
            const changes = [
              { time: start, value: valueAt(signal, start) },
              ...signal.transitions.filter((item) => item.time > start && item.time < end),
            ];
            return (
              <g key={signal.id}>
                <text x={10} y={y + 21} fill="#e2e8f0" fontSize={12}>
                  {signal.name.slice(-32)}
                </text>
                <text x={10} y={y + 40} fill="#5eead4" fontSize={12}>
                  {displayValue(valueAt(signal, cursor), signal.width)}
                </text>
                {changes.slice(0, 300).map((item, n) => {
                  const x1 = 270 + ((item.time - start) / span) * 720;
                  const x2 = 270 + (((changes[n + 1]?.time ?? end) - start) / span) * 720;
                  const high = item.value === '1';
                  return signal.width === 1 ? (
                    <path
                      key={n}
                      d={`M${x1},${y + 10} V${y + 40} M${x1},${y + (high ? 10 : 40)} H${x2}`}
                      stroke="#5eead4"
                      opacity={/[xz]/i.test(item.value) ? 0.4 : 1}
                      fill="none"
                    />
                  ) : (
                    <g key={n}>
                      <rect x={x1} y={y + 9} width={Math.max(0, x2 - x1)} height={32} fill="none" stroke="#67e8f9" />
                      {x2 - x1 > 42 && (
                        <text x={x1 + 4} y={y + 29} fontSize={12} fill="#e2e8f0">
                          {displayValue(item.value, signal.width)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
          {cursor >= start && cursor <= end && (
            <line
              x1={270 + ((cursor - start) / span) * 720}
              x2={270 + ((cursor - start) / span) * 720}
              y1={0}
              y2={signals.length * 54}
              stroke="#fbbf24"
              strokeWidth={2}
            />
          )}
        </svg>
      </Box>
      <TextField
        label="Cursor time (ticks)"
        type="number"
        value={cursor}
        inputProps={{ min: 0, max: total }}
        onChange={(event) => setCursor(Math.max(0, Math.min(total, Number(event.target.value))))}
        size="small"
      />
      <Slider
        aria-label="Waveform cursor"
        value={cursor}
        min={0}
        max={total}
        onChange={(_, value) => setCursor(value as number)}
      />
      <Typography variant="caption" color="text.secondary">
        Up to 300 segments per signal are drawn. Narrow the time window to inspect dense transitions; X and Z values
        indicate unknown or undriven state.
      </Typography>
    </Stack>
  );
}
