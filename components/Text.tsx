import { forwardRef } from 'react';
import { Text as RNText, type TextProps } from 'react-native';

import { fonts } from '../lib/theme';

/**
 * `<Text>` de l'app : applique Inter par défaut, sans devoir répéter
 * `fontFamily` dans chaque écran (React 19 ne supporte plus `defaultProps`
 * sur les composants fonction, donc pas moyen de patcher le `Text` natif de
 * React Native directement — ce wrapper est la seule façon fiable d'obtenir
 * une police par défaut globale). Un style explicite passé par l'appelant
 * (`fonts.display`, `fonts.serifSemiBold`...) reste prioritaire : il arrive
 * après ce défaut dans le tableau fusionné.
 */
export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...props }, ref) {
  return <RNText ref={ref} style={[{ fontFamily: fonts.serif }, style]} {...props} />;
});
