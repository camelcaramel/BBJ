import { useEffect, useState } from 'react';
import { loadTheme, saveTheme, type ThemeMode } from '../../utils/persist';

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme() ?? 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    saveTheme(theme);
  }, [theme]);

  return (
    <button className="btn" onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}>
      {theme === 'light' ? '다크 모드' : '라이트 모드'}
    </button>
  );
}


