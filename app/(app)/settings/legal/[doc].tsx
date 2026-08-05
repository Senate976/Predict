import { useLocalSearchParams } from 'expo-router';

import { SettingsStub } from '../../../../components/SettingsStub';
import { LEGAL_DOCS } from '../../../../lib/settingsSections';

export default function LegalDocScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const label = LEGAL_DOCS.find((d) => d.id === doc)?.label ?? 'Informations légales';
  return <SettingsStub title={label} />;
}
