import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from '../lib/auth';
import { darkColors, type Colors } from '../lib/theme';
import { ThemeModeProvider, useColors, useThemeMode } from '../lib/themeMode';

function RootNavigator() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { mode } = useThemeMode();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    // On attend la fin de la restauration de session pour ne pas afficher
    // l'écran de login à un utilisateur déjà connecté.
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/');
    }
  }, [session, loading, segments, router]);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // Chargée ici, une fois : le nom de police passé à useFonts (la clé de cet
  // objet) doit correspondre exactement à `fonts.body` dans lib/theme.ts,
  // sinon React Native retombe silencieusement sur la police système sans
  // avertir. Une seule famille (Inter) en 4 graisses — plus aucune serif ni
  // monospace à charger.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    // Rendu avant même `ThemeModeProvider` (la préférence n'est pas encore
    // chargée) — palette sombre fixe pour cette brève amorce, pas de
    // `useColors()` possible ici.
    return (
      <View style={splashStyles.loader}>
        <ActivityIndicator size="large" color={darkColors.text} />
      </View>
    );
  }

  return (
    <ThemeModeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeModeProvider>
  );
}

const splashStyles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: darkColors.background },
});

function createStyles(colors: Colors) {
  return StyleSheet.create({
    loader: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
  });
}
