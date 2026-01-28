/**
 * Usage Analytics Tracking
 * Client-side analytics for tracking algorithm usage patterns
 */

import { AlgorithmCategory } from '@/types/algorithms';

export interface AnalyticsEvent {
  id: string;
  type: 'algorithm_run' | 'template_load' | 'auto_tune' | 'export' | 'compare' | 'page_view';
  timestamp: number;
  category?: AlgorithmCategory;
  algorithm?: string;
  metadata?: Record<string, unknown>;
}

export interface UsageStats {
  totalRuns: number;
  algorithmUsage: Record<string, number>;
  categoryUsage: Record<string, number>;
  averageRuntime: number;
  popularAlgorithms: Array<{ algorithm: string; count: number }>;
  recentActivity: AnalyticsEvent[];
}

const ANALYTICS_STORAGE_KEY = 'algorithm_analytics';
const MAX_EVENTS = 1000; // Keep last 1000 events

/**
 * Track an analytics event
 */
export function trackEvent(
  type: AnalyticsEvent['type'],
  data?: {
    category?: AlgorithmCategory;
    algorithm?: string;
    metadata?: Record<string, unknown>;
  }
): void {
  // Only run in browser
  if (typeof window === 'undefined') return;

  try {
    const event: AnalyticsEvent = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      ...data,
    };

    const events = getEvents();
    events.push(event);

    // Keep only recent events
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }

    localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(events));

    // Console log for development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Analytics]', type, data);
    }
  } catch (error) {
    console.error('Failed to track analytics event:', error);
  }
}

/**
 * Get all analytics events
 */
export function getEvents(): AnalyticsEvent[] {
  // Only run in browser
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load analytics events:', error);
    return [];
  }
}

/**
 * Get usage statistics
 */
export function getUsageStats(): UsageStats {
  const events = getEvents();
  const algorithmRuns = events.filter((e) => e.type === 'algorithm_run');

  // Count algorithm usage
  const algorithmUsage: Record<string, number> = {};
  const categoryUsage: Record<string, number> = {};
  let totalRuntime = 0;
  let runtimeCount = 0;

  algorithmRuns.forEach((event) => {
    if (event.algorithm) {
      algorithmUsage[event.algorithm] = (algorithmUsage[event.algorithm] || 0) + 1;
    }
    if (event.category) {
      categoryUsage[event.category] = (categoryUsage[event.category] || 0) + 1;
    }
    if (event.metadata?.runtime && typeof event.metadata.runtime === 'number') {
      totalRuntime += event.metadata.runtime;
      runtimeCount++;
    }
  });

  // Get popular algorithms
  const popularAlgorithms = Object.entries(algorithmUsage)
    .map(([algorithm, count]) => ({ algorithm, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Recent activity (last 20 events)
  const recentActivity = events.slice(-20).reverse();

  return {
    totalRuns: algorithmRuns.length,
    algorithmUsage,
    categoryUsage,
    averageRuntime: runtimeCount > 0 ? totalRuntime / runtimeCount : 0,
    popularAlgorithms,
    recentActivity,
  };
}

/**
 * Get category breakdown for charts
 */
export function getCategoryBreakdown(): { category: string; count: number; percentage: number }[] {
  const stats = getUsageStats();
  const total = stats.totalRuns;

  return Object.entries(stats.categoryUsage)
    .map(([category, count]) => ({
      category: category.replace('_', ' ').toUpperCase(),
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get algorithm performance metrics
 */
export function getAlgorithmPerformance(algorithm: string): {
  totalRuns: number;
  averageRuntime: number;
  successRate: number;
  lastRun: number | null;
} {
  const events = getEvents().filter(
    (e) => e.type === 'algorithm_run' && e.algorithm === algorithm
  );

  let totalRuntime = 0;
  let runtimeCount = 0;
  let successCount = 0;

  events.forEach((event) => {
    if (event.metadata?.runtime && typeof event.metadata.runtime === 'number') {
      totalRuntime += event.metadata.runtime;
      runtimeCount++;
    }
    if (event.metadata?.success !== false) {
      successCount++;
    }
  });

  return {
    totalRuns: events.length,
    averageRuntime: runtimeCount > 0 ? totalRuntime / runtimeCount : 0,
    successRate: events.length > 0 ? (successCount / events.length) * 100 : 0,
    lastRun: events.length > 0 ? events[events.length - 1].timestamp : null,
  };
}

/**
 * Get usage trends over time
 */
export function getUsageTrends(days: number = 7): {
  date: string;
  runs: number;
}[] {
  const events = getEvents().filter((e) => e.type === 'algorithm_run');
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const trends: Record<string, number> = {};

  // Initialize all days
  for (let i = 0; i < days; i++) {
    const date = new Date(now - i * dayMs);
    const dateStr = date.toISOString().split('T')[0];
    trends[dateStr] = 0;
  }

  // Count events per day
  events.forEach((event) => {
    const date = new Date(event.timestamp);
    const dateStr = date.toISOString().split('T')[0];
    if (trends[dateStr] !== undefined) {
      trends[dateStr]++;
    }
  });

  return Object.entries(trends)
    .map(([date, runs]) => ({ date, runs }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Clear all analytics data
 */
export function clearAnalytics(): void {
  // Only run in browser
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(ANALYTICS_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear analytics:', error);
  }
}

/**
 * Export analytics data
 */
export function exportAnalytics(): string {
  const events = getEvents();
  const stats = getUsageStats();

  return JSON.stringify(
    {
      exportDate: new Date().toISOString(),
      stats,
      events,
    },
    null,
    2
  );
}

/**
 * Get event type label
 */
export function getEventTypeLabel(type: AnalyticsEvent['type']): string {
  switch (type) {
    case 'algorithm_run':
      return 'Algorithm Run';
    case 'template_load':
      return 'Template Loaded';
    case 'auto_tune':
      return 'Auto-Tune Applied';
    case 'export':
      return 'Results Exported';
    case 'compare':
      return 'Comparison Viewed';
    case 'page_view':
      return 'Page View';
    default:
      return type;
  }
}

/**
 * Get relative time string
 */
export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}
