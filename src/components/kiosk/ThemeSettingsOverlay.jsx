import { useContext } from 'react';
import { Kk } from './KioskContext';
import ThemeSettingsControl from '../ThemeSettingsControl';

export default function ThemeSettingsOverlay() {
  const {
    isThemeSettingsOpen,
    setIsThemeSettingsOpen,
    activeTheme,
    handleActiveThemeChange,
    theme,
    handleThemeColorChange,
    brightness,
    handleBrightnessChange,
    visualizerMode,
    handleVisualizerModeChange,
  } = useContext(Kk);

  return (
    <div
      className={`absolute inset-0 bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-1.5 font-sans ${
        isThemeSettingsOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`}
    >
      <ThemeSettingsControl
        activeTheme={activeTheme}
        onThemeChange={handleActiveThemeChange}
        themeColor={theme}
        onColorChange={handleThemeColorChange}
        brightness={brightness}
        onBrightnessChange={handleBrightnessChange}
        visualizerMode={visualizerMode}
        onVisualizerModeChange={handleVisualizerModeChange}
        onClose={() => setIsThemeSettingsOpen(false)}
      />
    </div>
  );
}
