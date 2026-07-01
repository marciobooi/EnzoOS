import { useContext, useState } from 'react';
import {
  Sliders, Palette, LogOut, Smartphone, Disc3, Cpu, SlidersHorizontal,
} from 'lucide-react';
import { Tk, Row, Section, Sheet } from './shared';
import InstallGuide from './InstallGuide';
import MetadataKeysSheet from './MetadataKeysSheet';
import SoundSettings from './settings/SoundSettings';
import DisplaySettings from './settings/DisplaySettings';
import AccountSettings from './settings/AccountSettings';
import SystemSettings from './settings/SystemSettings';
import { useI18n } from '../../i18n';
import LanguageChips from '../../i18n/LanguageChips';

// Settings is an index of grouped categories — each opens as its own
// full-screen Sheet — rather than one long undifferentiated scroll.
const GROUPS = [
  { id: 'sound',   labelKey: 'settings.sound',   icon: Sliders,           accent: undefined },
  { id: 'display', labelKey: 'settings.display', icon: Palette,           accent: '#8b5cf6' },
  { id: 'account', labelKey: 'settings.spotify', icon: Disc3,             accent: '#1ed760' },
  { id: 'system',  labelKey: 'settings.system',  icon: SlidersHorizontal, accent: undefined },
];

const GROUP_COMPONENTS = {
  sound: SoundSettings,
  display: DisplaySettings,
  account: AccountSettings,
  system: SystemSettings,
};

export default function SettingsTab() {
  const { t } = useI18n();
  const [openGroup, setOpenGroup] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [confirmSignout, setConfirmSignout] = useState(false);

  const { C, eraseCookie, setIsAuthenticated, setActiveTab } = useContext(Tk);

  const OpenGroup = openGroup ? GROUP_COMPONENTS[openGroup] : null;

  return (
    <div className="flex flex-col pt-5 pb-4">

      {/* header */}
      <div className="px-5 mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1"
          style={{ color: C.champagne, fontFamily: C.fontLabel }}>{t('settings.configuration')}</p>
        <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{t('nav.settings')}</h2>
      </div>

      {/* language — quick inline control, not worth its own sheet */}
      <Section title={t('settings.language')}>
        <div className="px-4 py-3">
          <LanguageChips colors={{
            bg: C.containerLow, fg: C.text4, border: C.outline,
            activeBg: C.champagne, activeFg: '#1a1c1c',
          }} />
        </div>
      </Section>

      {/* category index */}
      <Section>
        {GROUPS.map(({ id, labelKey, icon: Icon, accent }) => (
          <Row key={id} label={t(labelKey)}
            icon={<Icon className="h-4 w-4" style={{ color: accent || C.champagne }} />}
            onPress={() => setOpenGroup(id)} />
        ))}
        <Row label={t('settings.metadataKeys')} sub="Last.fm · TheAudioDB · Discogs"
          icon={<Cpu className="h-4 w-4" style={{ color: C.champagne }} />}
          onPress={() => setShowKeys(true)} />
        <Row label={t('settings.addToHome')} sub={t('settings.addToHomeSub')}
          icon={<Smartphone className="h-4 w-4" style={{ color: C.champagne }} />}
          onPress={() => setShowInstall(true)} />
      </Section>

      {/* session */}
      <Section>
        <Row label={confirmSignout ? t('settings.confirmDisconnect') : t('settings.disconnect')} destructive chevron={false}
          icon={<LogOut className="h-4 w-4" style={{ color: C.error }} />}
          onPress={() => {
            if (confirmSignout) { eraseCookie('remote_token'); setIsAuthenticated(false); setActiveTab('player'); return; }
            setConfirmSignout(true);
            setTimeout(() => setConfirmSignout(false), 3000);
          }} />
      </Section>

      {showInstall && <InstallGuide onClose={() => setShowInstall(false)} />}
      {showKeys && <MetadataKeysSheet onClose={() => setShowKeys(false)} />}

      {OpenGroup && (
        <Sheet C={C} kicker={t('settings.configuration')} title={t(GROUPS.find(g => g.id === openGroup).labelKey)}
          onBack={() => setOpenGroup(null)} padded={false}>
          <OpenGroup />
        </Sheet>
      )}
    </div>
  );
}
