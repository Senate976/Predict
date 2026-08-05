import { Image, StyleSheet, View } from 'react-native';
import { Text } from './Text';

import { colors } from '../lib/theme';

/**
 * Avatar circulaire avec repli sur l'initiale du pseudo tant que
 * `avatar_url` est vide — la grande majorité des comptes, `avatar_url` étant
 * optionnel (lib/avatar.ts, section 20 du schéma).
 */
export function Avatar({
  url,
  username,
  size = 36,
}: {
  url?: string | null;
  username?: string | null;
  size?: number;
}) {
  const initial = username?.trim().charAt(0).toUpperCase() || '?';
  const dimensions = { width: size, height: size, borderRadius: size / 2 };

  if (url) {
    return <Image source={{ uri: url }} style={[styles.image, dimensions]} />;
  }

  return (
    <View style={[styles.fallback, dimensions]}>
      <Text style={[styles.fallbackText, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.border },
  fallback: { backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: colors.text, fontWeight: '700' },
});
