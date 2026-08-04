import { Text } from 'react-native';

/**
 * Rendu unifié du mot « Predict » dans l'UI : toujours avec une majuscule, et
 * le P en gras. Réservé au texte réellement mis en forme (JSX) — les
 * dialogues natifs (`Alert.alert`, `window.confirm`) et les placeholders ne
 * supportent aucune mise en forme et gardent donc un « Predict » simple.
 */
export function PredictWord() {
  return (
    <Text>
      <Text style={{ fontWeight: '800' }}>P</Text>redict
    </Text>
  );
}
