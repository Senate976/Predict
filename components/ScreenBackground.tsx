import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg';

/**
 * Fond d'écran partagé par toute l'app : un dégradé radial doré, plus clair
 * au centre et plus chaud sur les bords, repris du fond du logo. Monté une
 * seule fois à la racine (`app/_layout.tsx`), derrière le `Stack` — chaque
 * écran garde donc un fond transparent (`colors.background`) plutôt que de
 * peindre sa propre couleur opaque par-dessus. `useWindowDimensions` (plutôt
 * que `Dimensions.get`, figé une fois pour toutes) suit le redimensionnement
 * de la fenêtre sur le web.
 */
export function ScreenBackground() {
  const { width, height } = useWindowDimensions();
  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id="appBackground" cx="50%" cy="38%" r="75%">
          <Stop offset="0" stopColor="#FDF6E1" stopOpacity={1} />
          <Stop offset="0.55" stopColor="#F5E2A6" stopOpacity={1} />
          <Stop offset="1" stopColor="#DFB768" stopOpacity={1} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#appBackground)" />
    </Svg>
  );
}
