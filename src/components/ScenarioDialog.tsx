'use client';

/**
 * Unified save/load scenarios dialog. Two modes:
 *
 *   - `mode="save"`: name input + save button. Pre-fills with the current
 *     algorithm name so the happy path is one click.
 *   - `mode="load"`: list of saved scenarios with a load button per row and
 *     a delete icon. Sorted newest-first via listScenarios().
 *
 * Scenarios are keyed to the current category/algorithm at save time; the
 * parent applies them on load, which also swaps the category/algorithm.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  List, ListItem, ListItemText, IconButton, Stack, Typography, Chip, Box, Divider,
} from '@mui/material';
import { Delete, FolderOpen, Save } from '@mui/icons-material';
import {
  listScenarios, saveScenario, deleteScenario, subscribeScenarios,
  type Scenario, type ScenarioParams,
} from '@/lib/scenarios';

interface BaseProps {
  open: boolean;
  onClose: () => void;
}

interface SaveProps extends BaseProps {
  mode: 'save';
  category: string;
  algorithm: string;
  parameters: ScenarioParams;
  defaultName?: string;
  onSaved?: (s: Scenario) => void;
}

interface LoadProps extends BaseProps {
  mode: 'load';
  onLoad: (s: Scenario) => void;
}

export type ScenarioDialogProps = SaveProps | LoadProps;

function fmtDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString();
}

export default function ScenarioDialog(props: ScenarioDialogProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [name, setName] = useState('');

  useEffect(() => {
    const refresh = () => setScenarios(listScenarios());
    refresh();
    return subscribeScenarios(refresh);
  }, []);

  // Reset the name field each time the save dialog opens. Pull the narrowed
  // values out into locals so the exhaustive-deps lint rule can see them.
  const saveOpen = props.mode === 'save' ? props.open : false;
  const saveDefaultName = props.mode === 'save' ? props.defaultName : undefined;
  const saveAlgorithm = props.mode === 'save' ? props.algorithm : '';
  useEffect(() => {
    if (saveOpen) setName(saveDefaultName ?? saveAlgorithm);
  }, [saveOpen, saveDefaultName, saveAlgorithm]);

  const nameTaken = useMemo(
    () => props.mode === 'save' && scenarios.some(s => s.name.toLowerCase() === name.trim().toLowerCase()),
    [props.mode, scenarios, name],
  );

  const handleSave = () => {
    if (props.mode !== 'save') return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const saved = saveScenario({
      name: trimmed,
      category: props.category,
      algorithm: props.algorithm,
      parameters: props.parameters,
    });
    props.onSaved?.(saved);
    props.onClose();
  };

  if (props.mode === 'save') {
    return (
      <Dialog open={props.open} onClose={props.onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Save scenario</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Scenario name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              autoFocus
              helperText={nameTaken ? 'A scenario with this name already exists — saving will overwrite it.' : 'Saved locally in your browser.'}
            />
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip size="small" label={`category: ${props.category}`} />
              <Chip size="small" label={`algorithm: ${props.algorithm}`} />
              <Chip size="small" label={`cells: ${props.parameters.cellCount}`} variant="outlined" />
              <Chip size="small" label={`nets: ${props.parameters.netCount}`} variant="outlined" />
              <Chip size="small" label={`iters: ${props.parameters.iterations}`} variant="outlined" />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" startIcon={<Save />} disabled={!name.trim()}>
            {nameTaken ? 'Overwrite' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // load mode
  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Load scenario</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {scenarios.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary">
              No saved scenarios yet. Configure an algorithm on the Algorithms page and
              click <em>Save Scenario</em> to capture it.
            </Typography>
          </Box>
        ) : (
          <List dense>
            {scenarios.map((s, i) => (
              <Box key={s.id}>
                {i > 0 && <Divider component="li" />}
                <ListItem
                  secondaryAction={
                    <Stack direction="row" spacing={0.5}>
                      <IconButton
                        size="small"
                        aria-label={`load ${s.name}`}
                        onClick={() => { props.onLoad(s); props.onClose(); }}
                      >
                        <FolderOpen fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={`delete ${s.name}`}
                        onClick={() => deleteScenario(s.id)}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Stack>
                  }
                >
                  <ListItemText
                    primary={s.name}
                    secondary={
                      <>
                        <Box component="span" sx={{ display: 'block', fontSize: '0.75rem', color: 'text.secondary' }}>
                          {s.category} · {s.algorithm}
                        </Box>
                        <Box component="span" sx={{ display: 'block', fontSize: '0.7rem', color: 'text.disabled' }}>
                          Updated {fmtDate(s.updatedAt)}
                        </Box>
                      </>
                    }
                  />
                </ListItem>
              </Box>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
