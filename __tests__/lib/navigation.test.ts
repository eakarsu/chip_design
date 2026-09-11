import {
  emptyNavPreferences,
  isFavorite,
  isGroupExpanded,
  loadNavPreferences,
  pushRecent,
  saveNavPreferences,
  setGroupCollapsed,
  toggleFavorite,
} from '@/lib/navigation';

describe('navigation preferences', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips favorites, recent and collapse state', () => {
    let preferences = toggleFavorite(emptyNavPreferences, { href: '/timing', label: 'Timing' });
    preferences = pushRecent(preferences, { href: '/dashboard', label: 'Dashboard' });
    preferences = setGroupCollapsed(preferences, 'Design Flow', true);
    saveNavPreferences(preferences);
    const loaded = loadNavPreferences();
    expect(loaded.favorites).toEqual([{ href: '/timing', label: 'Timing' }]);
    expect(loaded.recent).toEqual([{ href: '/dashboard', label: 'Dashboard' }]);
    expect(loaded.collapsed).toEqual({ 'Design Flow': true });
  });

  it('toggles favorites off and caps recent at five unique entries', () => {
    let preferences = toggleFavorite(emptyNavPreferences, { href: '/timing', label: 'Timing' });
    preferences = toggleFavorite(preferences, { href: '/timing', label: 'Timing' });
    expect(isFavorite(preferences, '/timing')).toBe(false);

    for (let index = 0; index < 7; index++) {
      preferences = pushRecent(preferences, { href: `/page-${index}`, label: `Page ${index}` });
    }
    preferences = pushRecent(preferences, { href: '/page-3', label: 'Page 3' });
    expect(preferences.recent).toHaveLength(5);
    expect(preferences.recent[0].href).toBe('/page-3');
    expect(new Set(preferences.recent.map((item) => item.href)).size).toBe(5);
  });

  it('expands the active group unless the user chose otherwise', () => {
    expect(isGroupExpanded(emptyNavPreferences, 'Design Flow', false)).toBe(false);
    expect(isGroupExpanded(emptyNavPreferences, 'Design Flow', true)).toBe(true);
    const collapsed = setGroupCollapsed(emptyNavPreferences, 'Design Flow', true);
    expect(isGroupExpanded(collapsed, 'Design Flow', true)).toBe(false);
    const opened = setGroupCollapsed(collapsed, 'Design Flow', false);
    expect(isGroupExpanded(opened, 'Design Flow', false)).toBe(true);
    expect(isGroupExpanded(emptyNavPreferences, 'Favorites', false, { alwaysOpen: true })).toBe(true);
  });

  it('recovers from malformed storage', () => {
    localStorage.setItem('neuralchip-nav-v1', '{"favorites":[{"href":5}],"recent":"nope"}');
    expect(loadNavPreferences()).toEqual(emptyNavPreferences);
  });
});
