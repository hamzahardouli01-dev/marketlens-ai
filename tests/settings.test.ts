/**
 * Settings & Preferences Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _store } from './setup';
import {
  getPreferences,
  savePreferences,
  DEFAULT_PREFERENCES,
  ACCENT_PALETTES,
} from '../src/services/settings';

beforeEach(() => {
  Object.keys(_store).forEach((k) => delete _store[k]);
});

describe('Settings Service', () => {
  it('returns default preferences when none are stored', async () => {
    const prefs = await getPreferences();
    expect(prefs).toEqual(DEFAULT_PREFERENCES);
    expect(prefs.showGridBadges).toBe(true);
    expect(prefs.showDetailPageButton).toBe(true);
    expect(prefs.theme).toBe('dark');
    expect(prefs.accentColor).toBe('blue');
  });

  it('saves and updates preferences', async () => {
    const updated = await savePreferences({
      showGridBadges: false,
      theme: 'light',
      accentColor: 'green',
    });

    expect(updated.showGridBadges).toBe(false);
    expect(updated.theme).toBe('light');
    expect(updated.accentColor).toBe('green');
    // Preserves other default fields
    expect(updated.showDetailPageButton).toBe(true);

    const reloaded = await getPreferences();
    expect(reloaded.showGridBadges).toBe(false);
    expect(reloaded.theme).toBe('light');
    expect(reloaded.accentColor).toBe('green');
  });

  it('contains valid color palette definitions', () => {
    expect(ACCENT_PALETTES.blue.primary).toBe('#0866FF');
    expect(ACCENT_PALETTES.green.primary).toBe('#10B981');
    expect(ACCENT_PALETTES.purple.primary).toBe('#8B5CF6');
    expect(ACCENT_PALETTES.amber.primary).toBe('#F59E0B');
    expect(ACCENT_PALETTES.red.primary).toBe('#EF4444');
  });
});
