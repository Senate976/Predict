import { Image, StyleSheet, View } from 'react-native';

/**
 * Filigrane du « P » en vitrail du logo. Toujours en fond (premier enfant,
 * `position: absolute`, sans interaction) — le contenu réel doit rester
 * lisible par-dessus, d'où l'opacité très basse par défaut sur les pages
 * pleines (Profil, Notifications, Cercle) ; les étiquettes de prédiction
 * passent une opacité un peu plus marquée et une taille contenue pour rester
 * un détail décoratif sans jamais déborder de la carte.
 */
export function PredictWatermark({
  opacity = 0.06,
  size,
}: {
  opacity?: number;
  /** Carré de ce côté, centré. Sans valeur : remplit tout le parent (pages pleines). */
  size?: number;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={require('../assets/predict-mark-transparent.png')}
        resizeMode="contain"
        style={[
          styles.base,
          { opacity },
          size
            ? { width: size, height: size, left: '50%', top: '50%', marginLeft: -size / 2, marginTop: -size / 2 }
            : [StyleSheet.absoluteFill, { width: '100%', height: '100%' }],
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { position: 'absolute' },
});
