import type { PaginatedResult, QueryOptions } from './types';

export function queryCollection<T extends Record<string, any>>(
  items: T[],
  options: QueryOptions = {}
): PaginatedResult<T> {
  const {
    page = 1,
    pageSize = 10,
    sortBy,
    sortOrder = 'desc',
    search,
    filters,
  } = options;

  let filtered = [...items];

  // Search across all string fields
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(item =>
      Object.values(item).some(val =>
        typeof val === 'string' && val.toLowerCase().includes(searchLower)
      )
    );
  }

  // Apply filters
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      filtered = filtered.filter(item => {
        const itemValue = item[key];
        if (Array.isArray(value)) {
          return value.includes(String(itemValue));
        }
        if (typeof value === 'boolean') {
          return itemValue === value;
        }
        return String(itemValue).toLowerCase() === String(value).toLowerCase();
      });
    });
  }

  // Sort
  if (sortBy) {
    filtered.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  // Paginate
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const data = filtered.slice(start, start + pageSize);

  return { data, total, page, pageSize, totalPages };
}
