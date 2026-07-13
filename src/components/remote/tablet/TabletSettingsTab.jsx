import { useContext, useState } from 'react';
import { ChevronLeft, LogOut, Smartphone, Cpu } from 'lucide-react';
import { Tk } from '../shared';
import { TabletSection, TabletRow } from './TabletSection';
import { GROUPS, GROUP_COMPONENTS } from '../SettingsTab';
import InstallGuide from '../InstallGuide';
import MetadataKeysSheet from '../MetadataKeysSheet';
import RemoteDspWizard from '../RemoteDspWizard';
import RemoteThemeSettings from '../RemoteThemeSettings';
import TabletPageHeader from './TabletPageHeader';
import { api } from '../../../api';
import { useI18n } from '../../../i18n';
import LanguageChips from '../../../i18n/LanguageChips';

// iPad's master-detail Settings: the list on the left of THIS SAME pane
// hands off to whichever detail is open, in place — no Sheet, no DSP wizard
// overlay, no theme-settings overlay. Same GROUPS/GROUP_COMPONENTS as the
// phone's SettingsTab (exported from there so the two can't drift), same
// RemoteDspWizard/RemoteThemeSettings RemoteControl.jsx renders globally for
// phone — this just mounts them here instead when isTablet is true (see the
// `!isTablet &&` guards around those two blocks in RemoteControl.jsx).
export default function TabletSettingsTab() {
  const { t } = useI18n();
  const [openGroup, setOpenGroup] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [confirmSignout, setConfirmSignout] = useState(false);

  const {
    C, eraseCookie, setIsAuthenticated, setActiveTab,
    isDspWizardOpen, setIsDspWizardOpen, setDspActive, pureDirect, handleTogglePureDirect,
    isThemeSettingsOpen, setIsThemeSettingsOpen,
    activeTheme, handleActiveThemeChange, theme, handleThemeColorChange,
    brightness, handleBrightnessChange, visualizerMode, handleVisualizerModeChange,
  } = useContext(Tk);

  // Deepest-open-thing-wins: the DSP wizard is opened FROM inside the Sound
  // group, and theme settings from inside Display — both outrank whichever
  // group/list is technically still "underneath" them.
  if (isDspWizardOpen) {
    return (
      <div className="pt-1">
        <BackHeader C={C} label="Room Calibration" onBack={() => {
          setIsDspWizardOpen(false);
          api.getDspCalibration().then(c => setDspActive(c && c[0] === 'dsp')).catch(() => {});
        }} />
        <RemoteDspWizard
          onClose={() => { setIsDspWizardOpen(false); api.getDspCalibration().then(c => setDspActive(c && c[0] === 'dsp')).catch(() => {}); }}
          onCalibrationComplete={active => setDspActive(active)}
          pureDirect={pureDirect}
          onPureDirectChange={handleTogglePureDirect}
        />
      </div>
    );
  }

  if (isThemeSettingsOpen) {
    return (
      <div className="pt-1">
        <BackHeader C={C} label="Theme & Appearance" onBack={() => setIsThemeSettingsOpen(false)} />
        <RemoteThemeSettings
          activeTheme={activeTheme} onThemeChange={handleActiveThemeChange}
          themeColor={theme} onColorChange={handleThemeColorChange}
          brightness={brightness} onBrightnessChange={handleBrightnessChange}
          visualizerMode={visualizerMode} onVisualizerModeChange={handleVisualizerModeChange}
        />
      </div>
    );
  }

  if (openGroup) {
    const GroupComponent = GROUP_COMPONENTS[openGroup];
    const group = GROUPS.find(g => g.id === openGroup);
    return (
      <div className="pt-1">
        <BackHeader C={C} label={t(group.labelKey)} onBack={() => setOpenGroup(null)} />
        <GroupComponent inline />
      </div>
    );
  }

  if (showKeys) {
    return (
      <div className="pt-1">
        <BackHeader C={C} label={t('meta.keysTitle')} onBack={() => setShowKeys(false)} />
        <MetadataKeysSheet inline onClose={() => setShowKeys(false)} />
      </div>
    );
  }

  if (showInstall) {
    return (
      <div className="pt-1">
        <BackHeader C={C} label="Install as App" onBack={() => setShowInstall(false)} />
        <InstallGuide inline onClose={() => setShowInstall(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col pt-5 pb-4">
      <TabletPageHeader title={t('nav.settings')} subtitle="Language, sound, display, streaming accounts, and system preferences." />

      <TabletSection title={t('settings.language')}>
        <div className="px-4 py-3">
          <LanguageChips colors={{
            bg: C.containerLow, fg: C.text4, border: C.outline,
            activeBg: C.champagne, activeFg: '#1a1c1c',
          }} />
        </div>
      </TabletSection>

      <TabletSection title={t('settings.preferences')}>
        {GROUPS.map(({ id, labelKey, icon: Icon, accent }) => (
          <TabletRow key={id} label={t(labelKey)}
            icon={<Icon className="h-4 w-4" style={{ color: accent || C.champagne }} />}
            onPress={() => setOpenGroup(id)} />
        ))}
        <TabletRow label={t('settings.metadataKeys')} sub="Last.fm · TheAudioDB · Discogs"
          icon={<Cpu className="h-4 w-4" style={{ color: C.champagne }} />}
          onPress={() => setShowKeys(true)} />
        <TabletRow label={t('settings.addToHome')} sub={t('settings.addToHomeSub')}
          icon={<Smartphone className="h-4 w-4" style={{ color: C.champagne }} />}
          onPress={() => setShowInstall(true)} />
      </TabletSection>

      <TabletSection>
        <TabletRow label={confirmSignout ? t('settings.confirmDisconnect') : t('settings.disconnect')} destructive chevron={false}
          icon={<LogOut className="h-4 w-4" style={{ color: C.error }} />}
          onPress={() => {
            if (confirmSignout) { eraseCookie('remote_token'); setIsAuthenticated(false); setActiveTab('player'); return; }
            setConfirmSignout(true);
            setTimeout(() => setConfirmSignout(false), 3000);
          }} />
      </TabletSection>
    </div>
  );
}

function BackHeader({ C, label, onBack }) {
  return (
    <div className="flex items-center gap-3 px-1 mb-4">
      <button onClick={onBack} aria-label="Back"
        className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
        style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
        <ChevronLeft className="h-4 w-4" style={{ color: C.text3 }} />
      </button>
      <p className="text-[17px] font-medium" style={{ color: C.text1 }}>{label}</p>
    </div>
  );
}
