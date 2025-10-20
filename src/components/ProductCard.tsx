'use client';

import { Card, CardContent, CardActions, Typography, Button, Chip, Box, Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Link from 'next/link';

export interface ProductCardProps {
  name: string;
  category: string;
  description: string;
  specs: { label: string; value: string }[];
  tags?: string[];
  href: string;
}

export default function ProductCard({ name, category, description, specs, tags, href }: ProductCardProps) {
  const theme = useTheme();

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-4px)',
        },
      }}
    >
      <CardContent sx={{ flexGrow: 1, p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Chip
            label={category}
            size="small"
            sx={{
              fontWeight: 500,
              bgcolor: theme.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(129, 140, 248, 0.2)',
              color: 'primary.main',
            }}
          />
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: theme.palette.text.secondary }}>
            memory
          </span>
        </Box>

        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
          {name}
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
          {description}
        </Typography>

        <Box sx={{ mb: 2 }}>
          {specs.map((spec, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                py: 0.75,
                borderBottom: index < specs.length - 1 ? `1px solid ${theme.palette.divider}` : 'none',
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {spec.label}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {spec.value}
              </Typography>
            </Box>
          ))}
        </Box>

        {tags && tags.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
            {tags.map((tag, index) => (
              <Chip key={index} label={tag} size="small" variant="outlined" />
            ))}
          </Stack>
        )}
      </CardContent>

      <CardActions sx={{ p: 3, pt: 0 }}>
        <Button
          component={Link}
          href={href}
          variant="text"
          fullWidth
          sx={{ fontWeight: 500 }}
          endIcon={
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              arrow_forward
            </span>
          }
        >
          Learn More
        </Button>
      </CardActions>
    </Card>
  );
}
