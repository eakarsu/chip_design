'use client';

import { Box, Container, Grid, Typography, Card, CardContent } from '@mui/material';
import { useTheme } from '@mui/material/styles';

export interface Feature {
  icon: string;
  title: string;
  description: string;
}

interface FeatureGridProps {
  title?: string;
  subtitle?: string;
  features: Feature[];
}

export default function FeatureGrid({ title, subtitle, features }: FeatureGridProps) {
  const theme = useTheme();

  return (
    <Box sx={{ py: { xs: 8, md: 12 } }}>
      <Container maxWidth="lg">
        {(title || subtitle) && (
          <Box sx={{ textAlign: 'center', mb: 8 }}>
            {title && (
              <Typography variant="h2" sx={{ fontWeight: 700, mb: 2, fontSize: { xs: '2rem', md: '2.5rem' } }}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 700, mx: 'auto' }}>
                {subtitle}
              </Typography>
            )}
          </Box>
        )}

        <Grid container spacing={3}>
          {features.map((feature, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.2s ease-in-out',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                  },
                }}
              >
                <CardContent sx={{ flexGrow: 1, p: 4 }}>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      bgcolor: theme.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(129, 140, 248, 0.2)',
                      mb: 3,
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 32,
                        color: theme.palette.primary.main,
                        fontVariationSettings: '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 48',
                      }}
                    >
                      {feature.icon}
                    </span>
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                    {feature.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    {feature.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
