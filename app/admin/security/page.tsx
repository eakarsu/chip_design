'use client';

import { Box, Typography, Card, CardContent, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';

const securityHeaders = [
  { header: 'X-DNS-Prefetch-Control', value: 'on', status: 'active', description: 'Controls DNS prefetching' },
  { header: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload', status: 'active', description: 'Enforces HTTPS connections' },
  { header: 'X-Content-Type-Options', value: 'nosniff', status: 'active', description: 'Prevents MIME type sniffing' },
  { header: 'X-Frame-Options', value: 'SAMEORIGIN', status: 'active', description: 'Prevents clickjacking' },
  { header: 'X-XSS-Protection', value: '1; mode=block', status: 'active', description: 'XSS filter protection' },
  { header: 'Referrer-Policy', value: 'strict-origin-when-cross-origin', status: 'active', description: 'Controls referrer information' },
  { header: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()', status: 'active', description: 'Restricts browser features' },
];

const sanitizationRules = [
  { rule: 'HTML Stripping', description: 'Removes all HTML tags from user input', status: 'active' },
  { rule: 'XSS Prevention', description: 'Escapes special HTML characters', status: 'active' },
  { rule: 'Input Trimming', description: 'Trims whitespace from all string inputs', status: 'active' },
  { rule: 'Search Parameter Limit', description: 'Limits search params to 200 characters', status: 'active' },
  { rule: 'Recursive Sanitization', description: 'Sanitizes nested objects recursively', status: 'active' },
];

export default function SecurityPage() {
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>Security</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>Security headers and input sanitization configuration</Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, verticalAlign: 'middle', marginRight: 8 }}>shield</span>
            Security Headers
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Header</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {securityHeaders.map(h => (
                  <TableRow key={h.header}>
                    <TableCell sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem' }}>{h.header}</TableCell>
                    <TableCell sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.value}</TableCell>
                    <TableCell><Chip label={h.status} size="small" color="success" /></TableCell>
                    <TableCell>{h.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, verticalAlign: 'middle', marginRight: 8 }}>cleaning_services</span>
            Input Sanitization Rules
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Rule</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sanitizationRules.map(r => (
                  <TableRow key={r.rule}>
                    <TableCell sx={{ fontWeight: 500 }}>{r.rule}</TableCell>
                    <TableCell>{r.description}</TableCell>
                    <TableCell><Chip label={r.status} size="small" color="success" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}
