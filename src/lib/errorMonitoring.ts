/**
 * Error Monitoring System
 * Tracks and logs errors for debugging and monitoring
 */

export interface ErrorLog {
  id: string;
  timestamp: number;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
}

const ERROR_STORAGE_KEY = 'error_logs';
const MAX_ERRORS = 100;

/**
 * Log an error
 */
export function logError(
  message: string,
  options?: {
    error?: Error;
    context?: Record<string, any>;
    severity?: ErrorLog['severity'];
  }
): void {
  try {
    const errorLog: ErrorLog = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      message,
      stack: options?.error?.stack,
      context: options?.context,
      severity: options?.severity || 'medium',
      resolved: false,
    };

    const errors = getErrorLogs();
    errors.push(errorLog);

    // Keep only recent errors
    if (errors.length > MAX_ERRORS) {
      errors.splice(0, errors.length - MAX_ERRORS);
    }

    localStorage.setItem(ERROR_STORAGE_KEY, JSON.stringify(errors));

    // Console log for development
    if (process.env.NODE_ENV === 'development') {
      console.error('[Error Monitor]', message, options);
    }
  } catch (e) {
    console.error('Failed to log error:', e);
  }
}

/**
 * Get all error logs
 */
export function getErrorLogs(): ErrorLog[] {
  try {
    const stored = localStorage.getItem(ERROR_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load error logs:', error);
    return [];
  }
}

/**
 * Get error statistics
 */
export function getErrorStats(): {
  total: number;
  byS everity: Record<string, number>;
  resolved: number;
  unresolved: number;
  recent: ErrorLog[];
} {
  const errors = getErrorLogs();
  const bySeverity: Record<string, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  let resolved = 0;
  let unresolved = 0;

  errors.forEach((error) => {
    bySeverity[error.severity]++;
    if (error.resolved) {
      resolved++;
    } else {
      unresolved++;
    }
  });

  return {
    total: errors.length,
    bySeverity,
    resolved,
    unresolved,
    recent: errors.slice(-10).reverse(),
  };
}

/**
 * Mark error as resolved
 */
export function resolveError(id: string): boolean {
  try {
    const errors = getErrorLogs();
    const error = errors.find((e) => e.id === id);
    if (error) {
      error.resolved = true;
      localStorage.setItem(ERROR_STORAGE_KEY, JSON.stringify(errors));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to resolve error:', error);
    return false;
  }
}

/**
 * Clear all error logs
 */
export function clearErrorLogs(): void {
  try {
    localStorage.removeItem(ERROR_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear error logs:', error);
  }
}

/**
 * Get severity color
 */
export function getSeverityColor(severity: ErrorLog['severity']): 'success' | 'warning' | 'error' {
  switch (severity) {
    case 'low':
      return 'success';
    case 'medium':
      return 'warning';
    case 'high':
    case 'critical':
      return 'error';
  }
}
