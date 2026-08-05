import { Image, StyleSheet, View } from 'react-native';

import { colors } from '../lib/theme';

/**
 * Fond de la barre de navigation : jaune moutarde uni, avec un grain subtil
 * par-dessus pour éviter un aplat trop plat. React Native ne supporte pas les
 * pseudo-éléments CSS ni les filtres SVG (`feTurbulence`) — le grain est donc
 * une texture bitmap pré-générée (`assets/nav-noise.png`), étirée sur toute la
 * barre et fondue avec `mixBlendMode` plutôt qu'avec un vrai `background-image`
 * encodé en base64.
 */
export function NavBarBackground() {
  return (
    <View style={styles.base}>
      <Image source={require('../assets/nav-noise.png')} resizeMode="stretch" style={styles.noise} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1, backgroundColor: colors.navBar },
  noise: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.05,
    mixBlendMode: 'multiply',
  },
});
