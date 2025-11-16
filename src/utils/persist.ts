import type { AppState } from '../state/types';

const KEY = 'banbaejung_state';
const THEME_KEY = 'banbaejung_theme';

export function saveState(state: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch {
    return null;
  }
}

export type ThemeMode = 'light' | 'dark';

export function saveTheme(theme: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

export function loadTheme(): ThemeMode | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}


