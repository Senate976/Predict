import { useLocalSearchParams } from 'expo-router';

import { SettingsStub } from '../../../components/SettingsStub';
import { SETTINGS_SECTIONS } from '../../../lib/settingsSections';

export default function SettingsSectionScreen() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const label = SETTINGS_SECTIONS.find((s) => s.id === section)?.label ?? 'Paramètres';
  return <SettingsStub title={label} />;
}
