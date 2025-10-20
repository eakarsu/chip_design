'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  InputBase,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Chip,
  Paper,
  alpha,
  IconButton,
  Divider,
} from '@mui/material';
import {
  Search as SearchIcon,
  Close as CloseIcon,
  Description as DocIcon,
  Code as AlgorithmIcon,
  Public as PageIcon,
  TrendingUp as TrendingIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useRouter } from 'next/navigation';
import { search, getSuggestions, getPopularSearches, SearchResult } from '@/lib/search';

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function SearchDialog({ open, onClose }: SearchDialogProps) {
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      setSuggestions(getPopularSearches());
    } else if (query.trim().length < 2) {
      setSuggestions(getSuggestions(query));
    } else {
      const searchResults = search(query, 8);
      setResults(searchResults);
      setSuggestions(getSuggestions(query));
    }
  }, [query]);

  const handleResultClick = (result: SearchResult) => {
    router.push(result.url);
    onClose();
    setQuery('');
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'algorithm':
        return <AlgorithmIcon fontSize="small" />;
      case 'doc':
        return <DocIcon fontSize="small" />;
      case 'page':
        return <PageIcon fontSize="small" />;
      default:
        return <SearchIcon fontSize="small" />;
    }
  };

  const getTypeColor = (type: string): 'primary' | 'success' | 'info' => {
    switch (type) {
      case 'algorithm':
        return 'primary';
      case 'doc':
        return 'success';
      case 'page':
        return 'info';
      default:
        return 'info';
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          position: 'fixed',
          top: 100,
          m: 0,
          maxHeight: 'calc(100vh - 200px)',
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        {/* Search Input */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
          <InputBase
            autoFocus
            fullWidth
            placeholder="Search algorithms, docs, and pages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ flex: 1, fontSize: '1.1rem' }}
          />
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Results or Suggestions */}
        <Box sx={{ maxHeight: '60vh', overflow: 'auto' }}>
          {results.length > 0 ? (
            <>
              {/* Search Results */}
              <List>
                {results.map((result) => (
                  <ListItem key={result.id} disablePadding>
                    <ListItemButton onClick={() => handleResultClick(result)}>
                      <Box sx={{ width: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                          <Chip
                            icon={getTypeIcon(result.type)}
                            label={result.type}
                            size="small"
                            color={getTypeColor(result.type)}
                            sx={{ mr: 1 }}
                          />
                          <Typography variant="subtitle1" fontWeight="medium">
                            {result.title}
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {result.description}
                        </Typography>
                        {result.tags && result.tags.length > 0 && (
                          <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                            {result.tags.slice(0, 4).map((tag) => (
                              <Chip key={tag} label={tag} size="small" variant="outlined" />
                            ))}
                          </Box>
                        )}
                      </Box>
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </>
          ) : (
            <>
              {/* Suggestions */}
              <Box sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <TrendingIcon sx={{ mr: 1, color: 'text.secondary' }} fontSize="small" />
                  <Typography variant="subtitle2" color="text.secondary">
                    {query.trim().length === 0 ? 'Popular Searches' : 'Suggestions'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {suggestions.map((suggestion) => (
                    <Chip
                      key={suggestion}
                      label={suggestion}
                      onClick={() => handleSuggestionClick(suggestion)}
                      clickable
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Box>

              {query.trim().length >= 2 && (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    No results found for "{query}"
                  </Typography>
                </Box>
              )}
            </>
          )}
        </Box>

        {/* Footer with keyboard shortcuts */}
        <Divider />
        <Box
          sx={{
            p: 1.5,
            display: 'flex',
            gap: 2,
            justifyContent: 'center',
            bgcolor: alpha(theme.palette.primary.main, 0.02),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip label="↑↓" size="small" />
            <Typography variant="caption" color="text.secondary">
              Navigate
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip label="↵" size="small" />
            <Typography variant="caption" color="text.secondary">
              Select
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip label="Esc" size="small" />
            <Typography variant="caption" color="text.secondary">
              Close
            </Typography>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
