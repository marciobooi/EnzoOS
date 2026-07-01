import { useContext } from 'react';
import { Palette, Power } from 'lucide-react';
import { Tk, Row, Section } from '../shared';
import { useI18n } from '../../../i18n';

export default function DisplaySettings() {
  const { t } = useI18n();
  const { C, standby, setIsThemeSettingsOpen, handleToggleStandby } = useContext(Tk);

  return (
    <div className="pt-1">
      <Section title={t('settings.display')}>
        <Row label={t('settings.themeAppearance')}
          icon={<Palette className="h-4 w-4" style={{ color: '#8b5cf6' }} />}
          onPress={() => setIsThemeSettingsOpen(true)} />
        <Row label={t('settings.kioskStandby')}
          icon={<Power className="h-4 w-4" style={{ color: standby ? C.error : C.text4 }} />}
          value={standby ? t('common.on') : t('common.off')} chevron={false}
          onPress={() => handleToggleStandby(!standby)} />
      </Section>
    </div>
  );
}
