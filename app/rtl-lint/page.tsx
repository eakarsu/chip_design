'use client';
/** RTL linter UI. */
import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, TextField,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { lintRtl } from '@/lib/tools/rtl_lint';

const DEFAULT_RTL = `module example;
  logic q;
  always_ff @(posedge clk) begin
    q = d; // bad: blocking in FF
  end
  always_comb begin
    y <= a; // bad: NB in comb
  end
  always @(*) case (s)
    2'b00: y = a;
  endcase
endmodule\t
`;

const SEV_COLOR: Record<string, string> = {
  error: '#dc2626', warning: '#f59e0b', info: '#0ea5e9',
};

export default function RtlLintPage() {
  const [src, setSrc] = useState(DEFAULT_RTL);
  const r = useMemo(() => lintRtl(src), [src]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">RTL Linter</Typography>
        <Chip label={`errors: ${r.errors}`}
          sx={{ bgcolor: r.errors > 0 ? '#dc2626' : '#16a34a', color: 'white' }} />
        <Chip label={`warn: ${r.warnings}`}
          sx={{ bgcolor: '#f59e0b', color: 'white' }} />
        <Chip label={`info: ${r.infos}`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <TextField fullWidth multiline minRows={10} value={src}
          onChange={e => setSrc(e.target.value)}
          slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 12 } } }} />
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead><TableRow>
            <TableCell>Line</TableCell>
            <TableCell>Sev</TableCell>
            <TableCell>Rule</TableCell>
            <TableCell>Message</TableCell>
            <TableCell>Text</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {r.violations.map((v, i) => (
              <TableRow key={i}>
                <TableCell>{v.line}</TableCell>
                <TableCell>
                  <Chip size="small" label={v.severity}
                    sx={{ bgcolor: SEV_COLOR[v.severity], color: 'white' }} />
                </TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{v.rule}</TableCell>
                <TableCell>{v.message}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{v.text}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
