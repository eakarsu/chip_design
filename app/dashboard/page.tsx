'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container, Typography, Grid, Card, CardActionArea, CardContent, Box, Chip,
  Paper, Skeleton, IconButton, Tooltip, Alert,
} from '@mui/material';
import {
  AccountTree, Compare, Speed, Memory, Insights, Timeline, ViewInAr,
  Settings, AutoGraph, MenuBook, GridOn, FlashOn, ImportExport,
  Architecture, History as HistoryIcon, BugReport, Search, Gavel,
  Star, StarBorder, Replay, PlayArrow,
} from '@mui/icons-material';
import type { ReactNode } from 'react';
import {
  listFavorites, toggleFavorite, isFavorite, subscribeFavorites, type FavoriteId,
} from '@/lib/favorites';

/**
 * A single clickable card on the dashboard. Clicking it navigates to `href`.
 */
interface CardSpec {
  title: string;
  description: string;
  icon: ReactNode;
  href: string;
  badge?: string;
}

interface Section {
  title: string;
  cards: CardSpec[];
}

const SECTIONS: Section[] = [
  {
    title: 'Design Flow',
    cards: [
      { title: 'Full Flow',        description: 'Run synthesis → PnR → signoff end-to-end.',          icon: <AccountTree />, href: '/flow' },
      { title: 'OpenLane',         description: 'OpenLane-style RTL→GDS simulation: designs, 11-stage runs, reports.', icon: <Architecture />, href: '/openlane', badge: 'new' },
      { title: 'Algorithms',       description: 'Browse the full algorithm catalog and run any one.', icon: <Memory />,      href: '/algorithms' },
      { title: 'Compare',          description: 'Head-to-head comparison of multiple algorithms.',    icon: <Compare />,     href: '/compare', badge: 'updated' },
      { title: 'Sweep',            description: 'Parameter sweeps across a design space.',            icon: <AutoGraph />,   href: '/sweep' },
      { title: 'Auto-Tune',        description: 'Automatic parameter optimization via Bayes-opt.',    icon: <FlashOn />,     href: '/autotune' },
      { title: 'Stream',           description: 'Live-streaming algorithm output.',                   icon: <Timeline />,    href: '/stream' },
      { title: 'Import',           description: 'Load LEF/DEF/Verilog netlists.',                     icon: <ImportExport />, href: '/import' },
    ],
  },
  {
    title: 'Analysis',
    cards: [
      { title: 'Congestion',   description: 'Routing-congestion heatmaps.',                        icon: <GridOn />,     href: '/congestion' },
      { title: 'IR Drop',      description: 'Power-grid IR-drop analysis and hotspot finding.',    icon: <FlashOn />,    href: '/ir-drop' },
      { title: 'Timing',       description: 'Static timing analysis (STA) and slack reports.',     icon: <Speed />,      href: '/timing' },
      { title: 'Pin Assign',   description: 'Automatic IO-pin placement on the die boundary.',     icon: <Settings />,   href: '/pin-assignment' },
      { title: 'Library',      description: 'Standard-cell library browser.',                      icon: <MenuBook />,   href: '/library' },
    ],
  },
  {
    title: 'Reports & Insights',
    cards: [
      { title: 'Visualizations', description: '2D/3D design visualization.',                       icon: <ViewInAr />,   href: '/visualizations' },
      { title: 'Analytics',      description: 'Usage and performance analytics.',                  icon: <Insights />,   href: '/analytics' },
      { title: 'History',        description: 'Past algorithm runs and their results.',            icon: <HistoryIcon />,    href: '/history' },
      { title: 'Benchmarks',     description: 'Benchmark scores and known results.',               icon: <Gavel />,      href: '/benchmarks' },
      { title: 'Architectures',  description: 'Chip architecture catalog.',                        icon: <Architecture />, href: '/architectures' },
    ],
  },
  {
    title: 'Resources',
    cards: [
      { title: 'Docs',       description: 'Product documentation.',               icon: <MenuBook />, href: '/docs' },
      { title: 'Products',   description: 'Product lineup.',                      icon: <Memory />,   href: '/products' },
      { title: 'AI Features',description: 'AI-assisted workflows and copilots.', icon: <FlashOn />,  href: '/ai-features', badge: 'new' },
      { title: 'Admin',      description: 'Administrative settings.',             icon: <Settings />, href: '/admin' },
    ],
  },
];

/** Minimal shape we read from GET /api/history — whatever else the
 *  endpoint returns we ignore. */
interface RecentRun {
  id: string;
  category: string;
  algorithm: string;
  success: boolean;
  runtimeMs: number;
  createdAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [favorites, setFavorites] = useState<FavoriteId[]>([]);
  const [runs, setRuns] = useState<RecentRun[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);

  // Keep favorites in sync with localStorage (including other tabs).
  useEffect(() => {
    setFavorites(listFavorites());
    return subscribeFavorites(() => setFavorites(listFavorites()));
  }, []);

  // Fetch recent runs. /api/history may 404 in dev before the DB is seeded —
  // treat that as "empty", not a user-facing error.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/history');
        if (!r.ok) throw new Error(`history returned ${r.status}`);
        const j = await r.json();
        if (cancelled) return;
        const list: RecentRun[] = (j.runs ?? []).slice(0, 5);
        setRuns(list);
      } catch (e) {
        if (cancelled) return;
        setRunsError(e instanceof Error ? e.message : String(e));
        setRuns([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000)   return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Jump into any area of the platform. Each card opens its full page.
      </Typography>

      {/* Favorites — only shown when the user has starred at least one. */}
      {favorites.length > 0 && (
        <Box sx={{ mb: 5 }}>
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Star color="warning" /> Favorites
          </Typography>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {favorites.map(id => {
                const [cat, alg] = id.split(':');
                return (
                  <Chip
                    key={id}
                    label={`${alg.replace(/_/g, ' ')} · ${cat.replace(/_/g, ' ')}`}
                    onClick={() => router.push(`/algorithms?category=${cat}&algorithm=${alg}`)}
                    onDelete={() => { toggleFavorite(id); }}
                    icon={<Star fontSize="small" />}
                    color="primary"
                    variant="outlined"
                    sx={{ fontFamily: 'monospace', maxWidth: '100%' }}
                  />
                );
              })}
            </Box>
          </Paper>
        </Box>
      )}

      {/* Recent Runs — shows the 5 most recent entries from /api/history. */}
      <Box sx={{ mb: 5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon /> Recent Runs
          </Typography>
          <Chip
            label="View all →"
            clickable
            size="small"
            onClick={() => router.push('/history')}
            variant="outlined"
          />
        </Box>

        {runs === null && (
          <Grid container spacing={2}>
            {[0, 1, 2, 3, 4].map(i => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={i}>
                <Skeleton variant="rounded" height={96} />
              </Grid>
            ))}
          </Grid>
        )}

        {runs !== null && runs.length === 0 && (
          <Alert severity="info" variant="outlined">
            {runsError
              ? 'Run history is unavailable right now. Trigger an algorithm run from the Algorithms page and it will show up here.'
              : 'No runs yet — pick an algorithm from the Algorithms page to get started.'}
          </Alert>
        )}

        {runs !== null && runs.length > 0 && (
          <Grid container spacing={2}>
            {runs.map(run => {
              const favId = `${run.category}:${run.algorithm}` as FavoriteId;
              const starred = favorites.includes(favId);
              return (
                <Grid item xs={12} sm={6} md={4} lg={3} key={run.id}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                      transition: 'border-color 120ms',
                      '&:hover': { borderColor: 'primary.main' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Chip
                        label={run.success ? 'OK' : 'FAIL'}
                        size="small"
                        color={run.success ? 'success' : 'error'}
                        sx={{ height: 18, fontSize: 10 }}
                      />
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: 'monospace', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {run.algorithm.replace(/_/g, ' ')}
                      </Typography>
                      <Tooltip title={starred ? 'Unfavorite' : 'Favorite'}>
                        <IconButton
                          size="small"
                          onClick={() => toggleFavorite(favId)}
                          sx={{ color: starred ? 'warning.main' : 'text.disabled' }}
                        >
                          {starred ? <Star fontSize="small" /> : <StarBorder fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {run.category.replace(/_/g, ' ')} · {run.runtimeMs.toFixed(0)}ms · {fmtTime(run.createdAt)}
                    </Typography>
                    <Box sx={{ mt: 'auto', display: 'flex', gap: 0.5 }}>
                      <Tooltip title="View in history">
                        <IconButton size="small" onClick={() => router.push(`/history#${run.id}`)}>
                          <HistoryIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Rerun">
                        <IconButton
                          size="small"
                          onClick={() => router.push(`/algorithms?category=${run.category}&algorithm=${run.algorithm}`)}
                        >
                          <Replay fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Box>

      {SECTIONS.map(section => (
        <Box key={section.title} sx={{ mb: 5 }}>
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
            {section.title}
          </Typography>
          <Grid container spacing={2}>
            {section.cards.map(card => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={card.title}>
                <Card
                  sx={{
                    height: '100%',
                    transition: 'transform 120ms, box-shadow 120ms',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
                  }}
                >
                  <CardActionArea onClick={() => router.push(card.href)} sx={{ height: '100%' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Box sx={{ color: 'primary.main', display: 'flex' }}>{card.icon}</Box>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {card.title}
                        </Typography>
                        {card.badge && (
                          <Chip
                            label={card.badge}
                            size="small"
                            color={card.badge === 'new' ? 'success' : 'primary'}
                            sx={{ ml: 'auto', height: 20 }}
                          />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {card.description}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
    </Container>
  );
}
