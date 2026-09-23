/**
 * MarketLens AI — User Settings & Customization Service
 *
 * Manages user preferences:
 * - Floating Grid Badges toggle (show/hide on Marketplace feed)
 * - Floating Detail Button toggle (show/hide on listing page)
 * - Auto-Analyze on Card Click toggle
 * - Color Theme ('dark' | 'light' | 'system')
 * - Accent Color ('blue' | 'green' | 'purple' | 'amber' | 'red')
 * - Card Density / Compact Mode
 */

export type ThemeMode = 'dark' | 'light' | 'system';
export type AccentColor = 'blue' | 'green' | 'purple' | 'amber' | 'red';

export interface UserPreferences {
  showGridBadges: boolean;
  showDetailPageButton: boolean;
  autoAnalyzeOnCardClick: boolean;
  theme: ThemeMode;
  accentColor: AccentColor;
  compactMode: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  showGridBadges: true,
  showDetailPageButton: true,
  autoAnalyzeOnCardClick: true,
  theme: 'dark',
  accentColor: 'blue',
  compactMode: false,
};

const STORAGE_KEY_PREFS = 'marketlens_preferences';

export const ACCENT_PALETTES: Record<
  AccentColor,
  { primary: string; hover: string; soft: string; name: string }
> = {
  blue: {
    primary: '#0866FF',
    hover: '#1877F2',
    soft: 'rgba(8, 102, 255, 0.15)',
    name: 'Facebook Blue',
  },
  green: {
    primary: '#10B981',
    hover: '#059669',
    soft: 'rgba(16, 185, 129, 0.15)',
    name: 'Emerald Flip',
  },
  purple: {
    primary: '#8B5CF6',
    hover: '#7C3AED',
    soft: 'rgba(139, 92, 246, 0.15)',
    name: 'Electric Violet',
  },
  amber: {
    primary: '#F59E0B',
    hover: '#D97706',
    soft: 'rgba(245, 158, 11, 0.15)',
    name: 'Cyber Amber',
  },
  red: {
    primary: '#EF4444',
    hover: '#DC2626',
    soft: 'rgba(239, 68, 68, 0.15)',
    name: 'Crimson Deal',
  },
};

export async function getPreferences(): Promise<UserPreferences> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(STORAGE_KEY_PREFS);
      if (res && res[STORAGE_KEY_PREFS]) {
        return { ...DEFAULT_PREFERENCES, ...res[STORAGE_KEY_PREFS] };
      }
    }
  } catch {
    // fallback
  }

  try {
    const local = localStorage.getItem(STORAGE_KEY_PREFS);
    if (local) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(local) };
    }
  } catch {
    // fallback
  }

  return DEFAULT_PREFERENCES;
}

export async function savePreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
  const current = await getPreferences();
  const updated: UserPreferences = { ...current, ...prefs };

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [STORAGE_KEY_PREFS]: updated });
    }
  } catch {
    // fallback
  }

  try {
    localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(updated));
  } catch {
    // fallback
  }

  return updated;
}

export function applyThemeVariables(prefs: UserPreferences, el: HTMLElement): void {
  const isDark =
    prefs.theme === 'dark' ||
    (prefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  el.setAttribute('data-theme', isDark ? 'dark' : 'light');
  el.setAttribute('data-accent', prefs.accentColor);

  const palette = ACCENT_PALETTES[prefs.accentColor] || ACCENT_PALETTES.blue;
  el.style.setProperty('--ml-accent', palette.primary);
  el.style.setProperty('--ml-accent-hover', palette.hover);
  el.style.setProperty('--ml-accent-soft', palette.soft);
}
