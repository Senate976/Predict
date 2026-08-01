import { Stack } from 'expo-router';

// Le groupe `(tabs)` porte la navigation par onglets (Fil, Archives, Cercle,
// Profil) ; les écrans en dehors — création, notifications, détail d'une
// prédiction — s'empilent par-dessus, sans barre d'onglets.
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="new-prediction" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
