/**
 * Personalized Recommendations System
 */

import { getEvents, trackEvent } from './analytics';

export interface UserPreferences {
  favoriteAlgorithms: string[];
  preferredCategories: string[];
  typicalParameters: Record<string, any>;
  successPatterns: Array<{
    algorithm: string;
    parameters: Record<string, any>;
    context: string;
  }>;
}

export function getUserPreferences(): UserPreferences {
  const events = getEvents();
  const algorithmRuns = events.filter((e) => e.type === 'algorithm_run');

  // Analyze usage patterns
  const algorithmCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const successfulConfigs: any[] = [];

  algorithmRuns.forEach((event) => {
    const algo = event.algorithm || '';
    const category = (event.metadata?.category as string) || '';
    const success = event.metadata?.success !== false;

    algorithmCounts.set(algo, (algorithmCounts.get(algo) || 0) + 1);
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);

    if (success && event.metadata?.parameters) {
      successfulConfigs.push({
        algorithm: algo,
        parameters: event.metadata.parameters,
        context: event.metadata?.context || '',
      });
    }
  });

  // Get top favorites
  const favoriteAlgorithms = Array.from(algorithmCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([algo]) => algo);

  const preferredCategories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat]) => cat);

  return {
    favoriteAlgorithms,
    preferredCategories,
    typicalParameters: {},
    successPatterns: successfulConfigs.slice(-20),
  };
}

export function getPersonalizedRecommendations(
  context: string,
  preferences?: UserPreferences
): Array<{ algorithm: string; reason: string; confidence: number }> {
  const prefs = preferences || getUserPreferences();
  const recommendations: Array<{ algorithm: string; reason: string; confidence: number }> = [];

  // Recommend based on past success
  prefs.successPatterns.forEach((pattern) => {
    if (pattern.context.includes(context) || context.includes(pattern.context)) {
      recommendations.push({
        algorithm: pattern.algorithm,
        reason: `You've had success with this for similar tasks`,
        confidence: 0.85,
      });
    }
  });

  // Recommend frequently used
  prefs.favoriteAlgorithms.slice(0, 3).forEach((algo) => {
    if (!recommendations.find((r) => r.algorithm === algo)) {
      recommendations.push({
        algorithm: algo,
        reason: `One of your most-used algorithms`,
        confidence: 0.7,
      });
    }
  });

  return recommendations.slice(0, 5);
}

export function shouldSuggestAlternative(algorithm: string, parameters: any): boolean {
  const prefs = getUserPreferences();

  // Check if user usually uses different algorithms
  const usage = prefs.favoriteAlgorithms.indexOf(algorithm);
  return usage === -1 || usage > 5;
}
