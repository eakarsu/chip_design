/**
 * Client-side caching system for algorithm results
 * Uses localStorage with TTL (time-to-live) support
 */

import { AlgorithmResponse, AlgorithmRequest } from '@/types/algorithms';

const CACHE_PREFIX = 'algo_cache_';
const CACHE_HISTORY_KEY = 'algo_history';
const MAX_CACHE_SIZE = 50; // Maximum number of cached results
const DEFAULT_TTL = 1000 * 60 * 60 * 24; // 24 hours in milliseconds

interface CacheEntry {
  key: string;
  data: AlgorithmResponse;
  timestamp: number;
  ttl: number;
  params: AlgorithmRequest;
}

/**
 * Generate a unique cache key from algorithm parameters
 */
export function generateCacheKey(params: AlgorithmRequest): string {
  // Create a deterministic hash of the parameters
  const str = JSON.stringify(params, Object.keys(params).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `${CACHE_PREFIX}${Math.abs(hash)}`;
}

/**
 * Save result to cache
 */
export function cacheResult(
  params: AlgorithmRequest,
  result: AlgorithmResponse,
  ttl: number = DEFAULT_TTL
): boolean {
  try {
    const key = generateCacheKey(params);
    const entry: CacheEntry = {
      key,
      data: result,
      timestamp: Date.now(),
      ttl,
      params,
    };

    // Save to localStorage
    localStorage.setItem(key, JSON.stringify(entry));

    // Update history
    updateCacheHistory(key);

    // Cleanup old entries
    cleanupCache();

    return true;
  } catch (error) {
    console.error('Failed to cache result:', error);
    return false;
  }
}

/**
 * Retrieve cached result
 */
export function getCachedResult(params: AlgorithmRequest): AlgorithmResponse | null {
  try {
    const key = generateCacheKey(params);
    const cached = localStorage.getItem(key);

    if (!cached) return null;

    const entry: CacheEntry = JSON.parse(cached);

    // Check if expired
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      // Expired - remove it
      localStorage.removeItem(key);
      return null;
    }

    return entry.data;
  } catch (error) {
    console.error('Failed to retrieve cached result:', error);
    return null;
  }
}

/**
 * Check if result exists in cache
 */
export function hasCachedResult(params: AlgorithmRequest): boolean {
  return getCachedResult(params) !== null;
}

/**
 * Clear specific cached result
 */
export function clearCachedResult(params: AlgorithmRequest): void {
  const key = generateCacheKey(params);
  localStorage.removeItem(key);
  removeCacheHistory(key);
}

/**
 * Clear all cached results
 */
export function clearAllCache(): void {
  try {
    const history = getCacheHistory();
    history.forEach(key => {
      localStorage.removeItem(key);
    });
    localStorage.removeItem(CACHE_HISTORY_KEY);
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  count: number;
  totalSize: number;
  oldestEntry: number | null;
  newestEntry: number | null;
} {
  const history = getCacheHistory();
  let totalSize = 0;
  let oldestEntry: number | null = null;
  let newestEntry: number | null = null;

  history.forEach(key => {
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        totalSize += cached.length;
        const entry: CacheEntry = JSON.parse(cached);

        if (oldestEntry === null || entry.timestamp < oldestEntry) {
          oldestEntry = entry.timestamp;
        }
        if (newestEntry === null || entry.timestamp > newestEntry) {
          newestEntry = entry.timestamp;
        }
      }
    } catch (error) {
      // Skip invalid entries
    }
  });

  return {
    count: history.length,
    totalSize,
    oldestEntry,
    newestEntry,
  };
}

/**
 * Get all cached results (for history view)
 */
export function getAllCachedResults(): CacheEntry[] {
  const history = getCacheHistory();
  const results: CacheEntry[] = [];

  history.forEach(key => {
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        const entry: CacheEntry = JSON.parse(cached);
        // Check if not expired
        const age = Date.now() - entry.timestamp;
        if (age <= entry.ttl) {
          results.push(entry);
        } else {
          // Remove expired entry
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      // Skip invalid entries
    }
  });

  // Sort by timestamp (newest first)
  return results.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Update cache history
 */
function updateCacheHistory(key: string): void {
  try {
    const history = getCacheHistory();

    // Add new key if not exists
    if (!history.includes(key)) {
      history.push(key);
    }

    // Keep only MAX_CACHE_SIZE entries
    if (history.length > MAX_CACHE_SIZE) {
      // Remove oldest entries
      const toRemove = history.slice(0, history.length - MAX_CACHE_SIZE);
      toRemove.forEach(k => localStorage.removeItem(k));
      history.splice(0, toRemove.length);
    }

    localStorage.setItem(CACHE_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to update cache history:', error);
  }
}

/**
 * Get cache history keys
 */
function getCacheHistory(): string[] {
  try {
    const history = localStorage.getItem(CACHE_HISTORY_KEY);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    return [];
  }
}

/**
 * Remove from cache history
 */
function removeCacheHistory(key: string): void {
  try {
    const history = getCacheHistory();
    const index = history.indexOf(key);
    if (index > -1) {
      history.splice(index, 1);
      localStorage.setItem(CACHE_HISTORY_KEY, JSON.stringify(history));
    }
  } catch (error) {
    console.error('Failed to remove from cache history:', error);
  }
}

/**
 * Cleanup expired cache entries
 */
function cleanupCache(): void {
  try {
    const history = getCacheHistory();
    const validKeys: string[] = [];

    history.forEach(key => {
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          const entry: CacheEntry = JSON.parse(cached);
          const age = Date.now() - entry.timestamp;

          if (age <= entry.ttl) {
            validKeys.push(key);
          } else {
            localStorage.removeItem(key);
          }
        }
      } catch (error) {
        // Remove invalid entry
        localStorage.removeItem(key);
      }
    });

    if (validKeys.length !== history.length) {
      localStorage.setItem(CACHE_HISTORY_KEY, JSON.stringify(validKeys));
    }
  } catch (error) {
    console.error('Failed to cleanup cache:', error);
  }
}

/**
 * Export cache for backup
 */
export function exportCache(): string {
  const results = getAllCachedResults();
  return JSON.stringify(results, null, 2);
}

/**
 * Import cache from backup
 */
export function importCache(data: string): boolean {
  try {
    const entries: CacheEntry[] = JSON.parse(data);

    entries.forEach(entry => {
      localStorage.setItem(entry.key, JSON.stringify(entry));
      updateCacheHistory(entry.key);
    });

    return true;
  } catch (error) {
    console.error('Failed to import cache:', error);
    return false;
  }
}

/**
 * Get cache size in bytes
 */
export function getCacheSize(): number {
  const history = getCacheHistory();
  let totalSize = 0;

  history.forEach(key => {
    const item = localStorage.getItem(key);
    if (item) {
      totalSize += item.length * 2; // UTF-16 encoding
    }
  });

  return totalSize;
}

/**
 * Format bytes to human-readable size
 */
export function formatCacheSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
