import { View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { colors } from '../lib/theme';

/**
 * Petit sceau royal décoratif — médaillon doré à tranche cannelée, devant la
 * date de scellé. Remplace un cadenas générique par le même langage visuel
 * que le sceau du badge de prestige (components/PrestigeBadge.tsx), en plus
 * discret et sans variation de métal : ici, une seule date, pas un niveau.
 */
export function RoyalSeal({ size = 16 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="royalSealGrad" cx="35%" cy="28%" r="80%">
            <Stop offset="0%" stopColor={colors.goldBright} />
            <Stop offset="100%" stopColor={colors.gold} />
          </RadialGradient>
        </Defs>

        {/* Tranche cannelée. */}
        <Circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={colors.gold}
          strokeWidth="7"
          strokeDasharray="4 7"
          opacity={0.4}
        />

        {/* Disque doré. */}
        <Circle cx="50" cy="50" r="36" fill="url(#royalSealGrad)" stroke={colors.waxDark} strokeWidth="2.5" />

        {/* Anneau gravé et joyau central. */}
        <Circle cx="50" cy="50" r="23" fill="none" stroke={colors.waxDark} strokeWidth="2" opacity={0.35} />
        <Circle cx="50" cy="50" r="7" fill={colors.waxDark} opacity={0.55} />
      </Svg>
    </View>
  );
}
