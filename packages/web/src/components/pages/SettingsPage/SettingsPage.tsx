import { SettingsPanel } from "@components/organisms/settings";
import { ViewPageProps } from "@types";

export const SettingsPage = ({ themeMode, onThemeModeChange }: ViewPageProps) => {
  return <SettingsPanel themeMode={themeMode} onThemeModeChange={onThemeModeChange} />;
};
