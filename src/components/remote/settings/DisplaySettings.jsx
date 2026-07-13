import { useContext } from 'react';
import { Palette, Power } from 'lucide-react';
import { Tk, Row as SharedRow, Section as SharedSection } from '../shared';
import { TabletRow, TabletSection } from '../tablet/TabletSection';
import { useI18n } from '../../../i18n';

// `inline`: tablet's TabletSettingsTab renders this with inline set, wanting
// the floating-card Row/Section (TabletSection.jsx) instead of the phone's
// compact ones. Same prop signature, so the JSX below is unchanged either way.
export default function DisplaySettings({ inline = false }) {
  const { t } = useI18n();
  const { C, standby, setIsThemeSettingsOpen, handleToggleStandby } = useContext(Tk);
  const Row = inline ? TabletRow : SharedRow;
  const Section = inline ? TabletSection : SharedSection;

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
