import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { darkColors, lightColors, type Colors } from './theme';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'predict.themeMode';

/**
 * Mémorise la préférence choisie dans Paramètres > Apparence et pilote la
 * palette active de toute l'app — voir `useColors()` plus bas, à appeler
 * dans chaque écran/composant à la place de l'ancien import statique de
 * `colors` (lib/theme.ts).
 */
const ThemeModeContext = createContext<{
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
} | null>(null);

export function ThemeModeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') setModeState(stored);
    });
  }, []);

  function setMode(next: ThemeMode) {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  }

  return <ThemeModeContext.Provider value={{ mode, setMode }}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode doit être utilisé sous ThemeModeProvider');
  return ctx;
}

/** Palette active — à appeler dans chaque écran/composant, jamais un import
 * statique de `colors` : c'est cet appel, réévalué à chaque changement de
 * mode, qui fait réagir tout l'app au sélecteur Clair/Sombre. */
export function useColors(): Colors {
  const { mode } = useThemeMode();
  return mode === 'light' ? lightColors : darkColors;
}
