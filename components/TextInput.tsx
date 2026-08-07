import { forwardRef } from 'react';
import { TextInput as RNTextInput, type TextInput as RNTextInputRef, type TextInputProps } from 'react-native';

import { fonts } from '../lib/theme';

/** `<TextInput>` de l'app — même défaut Plus Jakarta Sans que `components/Text.tsx`, pour les mêmes raisons. */
export const TextInput = forwardRef<RNTextInputRef, TextInputProps>(function TextInput({ style, ...props }, ref) {
  return <RNTextInput ref={ref} style={[{ fontFamily: fonts.body }, style]} {...props} />;
});
