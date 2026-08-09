import { Redirect } from 'expo-router';

/**
 * Route factice pour l'onglet central « + » de la barre de navigation — le
 * `tabPress` de ce même onglet (voir `_layout.tsx`) intercepte toujours le
 * tap avant d'atteindre cet écran et pousse `/new-prediction` à la place. Ce
 * composant ne s'affiche donc jamais ; il ne sert qu'à donner à expo-router
 * une route à enregistrer pour l'onglet.
 */
export default function CreateTabPlaceholder() {
  return <Redirect href="/new-prediction" />;
}
