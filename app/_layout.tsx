import { Cinzel_700Bold } from '@expo-google-fonts/cinzel';
import {
  CormorantGaramond_500Medium,
  CormorantGaramond_500Medium_Italic,
  CormorantGaramond_600SemiBold,
} from '@expo-google-fonts/cormorant-garamond';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ScreenBackground } from '../components/ScreenBackground';
import { AuthProvider, useAuth } from '../lib/auth';
import { colors } from '../lib/theme';

// React Navigation peint le fond de chaque écran via ce thème (indépendamment
// de tout `contentStyle`/`sceneStyle` par écran, qui se heurte à un souci
// d'ordre de priorité CSS sur React Native Web face à cette valeur par
// défaut). Le rendre transparent ici, une seule fois, laisse le dégradé de
// `ScreenBackground` visible derrière tous les écrans/onglets.
const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent' },
};

function RootNavigator() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

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
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ThemeProvider value={navTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </ThemeProvider>
    </View>
  );
}

export default function RootLayout() {
  // Chargée ici, une fois : le nom de police passé à useFonts (la clé de cet
  // objet) doit correspondre exactement à `fonts.serif` dans lib/theme.ts,
  // sinon React Native retombe silencieusement sur la police système sans
  // avertir.
  const [fontsLoaded] = useFonts({
    Cinzel_700Bold,
    CormorantGaramond_500Medium,
    CormorantGaramond_500Medium_Italic,
    CormorantGaramond_600SemiBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
