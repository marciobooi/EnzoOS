import { useContext, useState, useRef } from 'react';
import { LogOut, Laptop } from 'lucide-react';
import { toast } from '../../../lib/toast';
import { Tk, Row, Section, SpotifyIcon } from '../shared';
import { useI18n } from '../../../i18n';

export default function AccountSettings() {
  const { t } = useI18n();
  const [confirmPending, setConfirmPending] = useState(null);
  const confirmRef = useRef(null);
  const { C, token, devices, handleTransferPlayback, sendUpdate, setToken, setPlaybackState, setDevices } = useContext(Tk);

  const withConfirm = (key, action) => () => {
    if (confirmPending === key) {
      clearTimeout(confirmRef.current);
      setConfirmPending(null);
      action();
    } else {
      setConfirmPending(key);
      clearTimeout(confirmRef.current);
      confirmRef.current = setTimeout(() => setConfirmPending(null), 3000);
    }
  };

  return (
    <div className="pt-1">
      <Section title={t('settings.spotify')}>
        {!token ? (
          <div className="px-4 py-4">
            <a href="/auth/spotify/login?from=remote"
              className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 text-[14px] font-semibold active:scale-95 transition-all"
              style={{ background: '#1ed760', color: '#000', display: 'flex', fontFamily: C.font }}>
              <SpotifyIcon className="h-5 w-5 fill-black shrink-0" />
              {t('settings.connectSpotify')}
            </a>
          </div>
        ) : (
          <>
            <Row label={t('common.connected')} value="✓" chevron={false}
              icon={<SpotifyIcon className="h-4 w-4" style={{ fill: '#1ed760' }} />}
              onPress={() => {}} />
            <Row label={confirmPending === 'spotify-disconnect' ? t('settings.confirm') : t('settings.disconnect')} destructive
              icon={<LogOut className="h-4 w-4" style={{ color: C.error }} />}
              onPress={withConfirm('spotify-disconnect', async () => {
                try { await fetch('/auth/spotify/logout', { method: 'POST' }); }
                catch { /* logout is best-effort — still clear local state below */ }
                // Mirrors Kiosk.jsx's handleLogout: clear local state AND tell
                // every other connected client (kiosk + other remotes) to clear
                // theirs too, so stale Spotify UI doesn't linger until reload.
                setToken?.('');
                setPlaybackState?.(null);
                setDevices?.([]);
                sendUpdate?.('CLEAR_TOKEN');
                toast.success(t('settings.disconnected'));
              })} />
          </>
        )}
      </Section>

      {devices.length > 0 && (
        <Section title={`Cast · ${devices.length} device${devices.length !== 1 ? 's' : ''}`}>
          {devices.map(d => (
            <Row key={d.id} label={d.name} value={d.is_active ? 'Active' : ''}
              icon={<Laptop className="h-4 w-4" style={{ color: d.is_active ? C.champagne : C.text4 }} />}
              onPress={() => handleTransferPlayback(d.id)} />
          ))}
        </Section>
      )}
    </div>
  );
}
