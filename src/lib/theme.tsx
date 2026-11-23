import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

const KEY = 'mp-theme';
const media = () => window.matchMedia?.('(prefers-color-scheme: dark)');

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const resolve = (choice: ThemeChoice): Theme =>
  choice === 'system' ? (media()?.matches ? 'dark' : 'light') : choice;

interface ThemeState { choice: ThemeChoice; theme: Theme; setChoice: (c: ThemeChoice) => void }
const ThemeContext = createContext<ThemeState>({ choice: 'system', theme: 'light', setChoice: () => {} });

/** Light/dark mode: follows the system until the person picks one, and remembers their pick. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const [theme, setTheme] = useState<Theme>(() => resolve(readChoice()));

  useEffect(() => {
    const apply = () => {
      const t = resolve(choice);
      setTheme(t);
      document.documentElement.dataset.theme = t;
    };
    apply();
    if (choice !== 'system') return;
    const m = media();
    m?.addEventListener('change', apply);
    return () => m?.removeEventListener('change', apply);
  }, [choice]);

  const setChoice = (c: ThemeChoice) => {
    try { if (c === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, c); } catch { /* private mode */ }
    setChoiceState(c);
  };

  return <ThemeContext.Provider value={{ choice, theme, setChoice }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
