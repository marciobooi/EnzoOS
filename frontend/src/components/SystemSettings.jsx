import { useState, useEffect } from 'react';
import { X, Settings, DownloadCloud } from 'lucide-react';

export default function SystemSettings({ onClose, onThemeChange }) {
  const [theme, setTheme] = useState('dark-minimalist');
  const [vuStyle, setVuStyle] = useState('digital');
  const [isUpdating, setIsUpdating] = useState(false);

  const apiBase = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}/api`;

  useEffect(() => {
    // Load current settings
    fetch(`${apiBase}/system/settings`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setTheme(data.settings.theme || 'dark-minimalist');
          setVuStyle(data.settings.vuMeterStyle || 'digital');
        }
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSettings = async (newTheme, newVuStyle) => {
    setTheme(newTheme);
    setVuStyle(newVuStyle);
    onThemeChange(newTheme, newVuStyle);

    try {
      await fetch(`${apiBase}/system/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: newTheme, vuMeterStyle: newVuStyle })
      });
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  };

  const handleOTAUpdate = async () => {
    if (!window.confirm("Are you sure you want to run a system update? The audio will stop and the UI will reload.")) return;

    setIsUpdating(true);
    try {
      const res = await fetch(`${apiBase}/system/update`, { method: 'POST' });
      const data = await res.json();
      alert(data.message);

      // Force reload after 10 seconds giving time for the system to come back
      setTimeout(() => {
        window.location.reload();
      }, 10000);

    } catch (e) {
      alert("Failed to initiate update.");
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="glass-panel w-full max-w-2xl rounded-2xl shadow-2xl p-8 flex flex-col h-full max-h-[90vh]">

        {/* Header */}
        <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
          <h2 className="text-3xl font-bold text-[var(--text-main)] tracking-wide flex items-center gap-3">
            <Settings size={32} className="text-[var(--accent)]" />
            <span>System OS Settings</span>
          </h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors p-2 bg-white/5 hover:bg-white/10 rounded-full">
             <X size={28} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-8 pr-2">

          {/* Appearance Section */}
          <section>
            <h3 className="text-[var(--accent)] text-lg font-semibold uppercase tracking-widest mb-4">Appearance Theme</h3>
            <div className="grid grid-cols-3 gap-4">
              {['dark-minimalist', 'rose-gold', 'mcintosh', 'dot-matrix', 'ocean-breeze'].map(t => (
                <button
                  key={t}
                  onClick={() => saveSettings(t, vuStyle)}
                  className={`p-4 rounded-xl border text-center transition-all ${
                    theme === t
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_0_15px_var(--accent)]'
                      : 'border-white/10 bg-black/30 text-[var(--text-muted)] hover:border-white/30'
                  }`}
                >
                  <span className="capitalize">{t.replace('-', ' ')}</span>
                </button>
              ))}
            </div>
          </section>

          {/* VU Meter Style Section */}
          <section>
            <h3 className="text-[var(--accent)] text-lg font-semibold uppercase tracking-widest mb-4">VU Meter Style</h3>
            <div className="flex space-x-4">
              {['digital', 'analog'].map(v => (
                <button
                  key={v}
                  onClick={() => saveSettings(theme, v)}
                  className={`flex-1 p-4 rounded-xl border text-center transition-all ${
                    vuStyle === v
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-white/10 bg-black/30 text-[var(--text-muted)] hover:border-white/30'
                  }`}
                >
                  <span className="capitalize">{v} {v === 'analog' ? 'Needle' : 'Bars'}</span>
                </button>
              ))}
            </div>
          </section>

          {/* System Update Section */}
          <section className="pt-8 border-t border-white/10">
            <div className="flex items-center justify-between bg-black/40 p-6 rounded-xl border border-white/5">
              <div>
                <h3 className="text-[var(--text-main)] text-xl font-bold mb-1">Over-The-Air Update</h3>
                <p className="text-[var(--text-muted)] text-sm">Download and install the latest system software.</p>
              </div>
              <button
                onClick={handleOTAUpdate}
                disabled={isUpdating}
                className="px-8 py-3 flex items-center gap-2 bg-[var(--accent)] hover:brightness-110 text-white font-bold rounded-xl transition-all shadow-lg disabled:opacity-50"
              >
                <DownloadCloud size={20} />
                <span>{isUpdating ? 'Updating OS...' : 'Check for Updates'}</span>
              </button>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
