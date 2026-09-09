'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { Box, Stack, Typography } from '@mui/material';

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <Box key={index} component="code" sx={{ bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 }}>
          {part.slice(1, -1)}
        </Box>
      );
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link && (/^\/(?!\/)/.test(link[2]) || /^https?:\/\//.test(link[2])))
      return (
        <Link key={index} href={link[2]}>
          {link[1]}
        </Link>
      );
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export default function ChatAnswer({ content }: { content: string }) {
  return (
    <Stack gap={1.25}>
      {content
        .split(/(```[\s\S]*?(?:```|$))/g)
        .filter(Boolean)
        .map((block, index) => {
          if (block.startsWith('```')) {
            const code = block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
            return (
              <Box
                key={index}
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  bgcolor: '#0f172a',
                  color: '#e2e8f0',
                  borderRadius: 1.5,
                  overflowX: 'auto',
                  fontSize: 13,
                }}
              >
                <code>{code}</code>
              </Box>
            );
          }
          return (
            <Stack gap={1} key={index}>
              {block
                .trim()
                .split(/\n\s*\n/)
                .filter(Boolean)
                .map((paragraph, item) => (
                  <Typography
                    key={item}
                    component="div"
                    variant="body2"
                    sx={{ lineHeight: 1.75, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                  >
                    {inline(paragraph.replace(/^#{1,6}\s+/gm, ''))}
                  </Typography>
                ))}
            </Stack>
          );
        })}
    </Stack>
  );
}
