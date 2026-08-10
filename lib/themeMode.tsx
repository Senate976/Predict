import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'predict.themeMode';

/**
 * Mémorise uniquement la préférence choisie dans Paramètres > Apparence —
 * ne pilote encore aucun style : toutes les palettes de l'app restent
 * câblées en dur sur `colors` (lib/theme.ts). Câbler chaque écran sur ce
 * mode viendra dans une passe suivante ; en attendant, `mode` reste "dark"
 * quel que soit le choix, l'app ne changeant pas encore visuellement.
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
