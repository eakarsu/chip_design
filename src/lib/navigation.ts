/**
 * Persisted sidebar preferences: favorites, recent pages and group collapse
 * state. Pure helpers keep the storage shape testable; all reads are guarded
 * so a private browser without localStorage still works.
 */

export interface NavItemRef {
  href: string;
  label: string;
}

export interface NavPreferences {
  favorites: NavItemRef[];
  recent: NavItemRef[];
  /** title → true when the user explicitly collapsed the group. */
  collapsed: Record<string, boolean>;
}

export const emptyNavPreferences: NavPreferences = { favorites: [], recent: [], collapsed: {} };

const storageKey = 'neuralchip-nav-v1';
const RECENT_LIMIT = 5;

export function loadNavPreferences(): NavPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<NavPreferences> | null;
    if (!parsed) return { ...emptyNavPreferences };
    const items = (value: unknown): NavItemRef[] =>
      Array.isArray(value)
        ? value.filter(
            (item): item is NavItemRef =>
              Boolean(item) &&
              typeof item === 'object' &&
              typeof (item as NavItemRef).href === 'string' &&
              typeof (item as NavItemRef).label === 'string'
          )
        : [];
    return {
      favorites: items(parsed.favorites),
      recent: items(parsed.recent).slice(0, RECENT_LIMIT),
      collapsed:
        parsed.collapsed && typeof parsed.collapsed === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.collapsed).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')
            )
          : {},
    };
  } catch {
    return { ...emptyNavPreferences };
  }
}

export function saveNavPreferences(preferences: NavPreferences): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    /* Optional preference storage. */
  }
}

export function isFavorite(preferences: NavPreferences, href: string): boolean {
  return preferences.favorites.some((item) => item.href === href);
}

export function toggleFavorite(preferences: NavPreferences, item: NavItemRef): NavPreferences {
  const favorites = isFavorite(preferences, item.href)
    ? preferences.favorites.filter((favorite) => favorite.href !== item.href)
    : [...preferences.favorites, item];
  return { ...preferences, favorites };
}

export function pushRecent(preferences: NavPreferences, item: NavItemRef): NavPreferences {
  const existing = preferences.recent.filter((recent) => recent.href !== item.href);
  return { ...preferences, recent: [item, ...existing].slice(0, RECENT_LIMIT) };
}

export function setGroupCollapsed(preferences: NavPreferences, title: string, collapsed: boolean): NavPreferences {
  return { ...preferences, collapsed: { ...preferences.collapsed, [title]: collapsed } };
}

export function isGroupExpanded(
  preferences: NavPreferences,
  title: string,
  hasActiveItem: boolean,
  { alwaysOpen = false }: { alwaysOpen?: boolean } = {}
): boolean {
  const explicit = preferences.collapsed[title];
  if (typeof explicit === 'boolean') return !explicit;
  if (alwaysOpen) return true;
  return hasActiveItem;
}
