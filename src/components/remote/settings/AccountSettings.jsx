import { useContext, useState, useRef, useEffect } from 'react';
import { LogOut, Laptop, AudioLines } from 'lucide-react';
import { toast } from '../../../lib/toast';
import { reportError } from '../../../lib/errors';
import { Tk, Row, Section, SpotifyIcon } from '../shared';
import { useI18n } from '../../../i18n';

export default function AccountSettings() {
  const { t } = useI18n();
  const [confirmPending, setConfirmPending] = useState(null);
  const confirmRef = useRef(null);
  const { C, token, devices, handleTransferPlayback, sendUpdate, setToken, setPlaybackState, setDevices } = useContext(Tk);

  // Last.fm scrobbling — desktop auth flow against /api/system/lastfm/*
  const [lastfm, setLastfm] = useState(null); // { configured, connected, user }
  const [lfKey, setLfKey] = useState('');
  const [lfSecret, setLfSecret] = useState('');
  const [lfBusy, setLfBusy] = useState(false);
  const lfPollRef = useRef(null);

  useEffect(() => {
    fetch('/api/system/lastfm/status').then(r => r.json()).then(setLastfm).catch(() => {});
    return () => clearInterval(lfPollRef.current);
  }, []);

  const lastfmSaveKeys = async () => {
    if (!lfKey.trim() || !lfSecret.trim()) return;
    setLfBusy(true);
    try {
      const r = await fetch('/api/system/lastfm/keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: lfKey.trim(), secret: lfSecret.trim() }),
      });
      if (!r.ok) throw new Error((await r.json())?.error || 'Save failed');
      setLastfm(await r.json());
    } catch (e) { reportError(e.message); }
    finally { setLfBusy(false); }
  };

  const lastfmConnect = async () => {
    setLfBusy(true);
    try {
      const r = await fetch('/api/system/lastfm/connect');
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Connect failed');
      window.open(d.authUrl, '_blank');
      // Poll for approval: last.fm has no callback for the desktop flow, so
      // exchange the token every 4s until the user approves (max ~3 min).
      clearInterval(lfPollRef.current);
      const deadline = Date.now() + 180_000;
      lfPollRef.current = setInterval(async () => {
        if (Date.now() > deadline) { clearInterval(lfPollRef.current); setLfBusy(false); return; }
        try {
          const c = await fetch('/api/system/lastfm/complete', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: d.token }),
          });
          if (c.ok) {
            const s = await c.json();
            clearInterval(lfPollRef.current);
            setLastfm(prev => ({ ...prev, connected: true, user: s.user }));
            setLfBusy(false);
            toast.success(t('lastfm.connected', { user: s.user }));
          }
        } catch { /* not approved yet — keep polling */ }
      }, 4000);
    } catch (e) { reportError(e.message); setLfBusy(false); }
  };

  const lastfmDisconnect = async () => {
    try {
      await fetch('/api/system/lastfm/disconnect', { method: 'POST' });
      setLastfm(prev => ({ ...prev, connected: false, user: null }));
    } catch (e) { reportError(e.message); }
  };

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

      <Section title="Last.fm">
        {!lastfm ? null : lastfm.connected ? (
          <>
            <Row label={t('lastfm.scrobblingAs', { user: lastfm.user })} value="✓" chevron={false}
              icon={<AudioLines className="h-4 w-4" style={{ color: '#d51007' }} />}
              onPress={() => {}} />
            <Row label={confirmPending === 'lastfm-disconnect' ? t('settings.confirm') : t('settings.disconnect')} destructive
              icon={<LogOut className="h-4 w-4" style={{ color: C.error }} />}
              onPress={withConfirm('lastfm-disconnect', lastfmDisconnect)} />
          </>
        ) : lastfm.configured ? (
          <div className="px-4 py-4 flex flex-col gap-2">
            <p className="text-[12px]" style={{ color: C.text3 }}>{t('lastfm.approveHint')}</p>
            <button onClick={lastfmConnect} disabled={lfBusy}
              className="w-full py-3 rounded-full text-[14px] font-semibold active:scale-95 transition-all disabled:opacity-50"
              style={{ background: '#d51007', color: '#fff', fontFamily: C.font }}>
              {lfBusy ? t('lastfm.waiting') : t('lastfm.connect')}
            </button>
          </div>
        ) : (
          <div className="px-4 py-4 flex flex-col gap-2">
            <p className="text-[12px]" style={{ color: C.text3 }}>{t('lastfm.keysHint')}</p>
            <input type="text" value={lfKey} onChange={e => setLfKey(e.target.value)} placeholder="API key"
              autoCapitalize="none" autoComplete="off" spellCheck={false}
              className="rounded-xl px-3 py-2.5 text-[14px] focus:outline-none"
              style={{ background: C.containerLow, color: C.text1, border: `0.5px solid ${C.outline}` }} />
            <input type="password" value={lfSecret} onChange={e => setLfSecret(e.target.value)} placeholder="Shared secret"
              autoComplete="off"
              className="rounded-xl px-3 py-2.5 text-[14px] focus:outline-none"
              style={{ background: C.containerLow, color: C.text1, border: `0.5px solid ${C.outline}` }} />
            <button onClick={lastfmSaveKeys} disabled={lfBusy || !lfKey.trim() || !lfSecret.trim()}
              className="w-full py-3 rounded-full text-[14px] font-semibold active:scale-95 transition-all disabled:opacity-40"
              style={{ background: C.champagne, color: '#1a1c1c', fontFamily: C.font }}>
              {t('lastfm.saveKeys')}
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}
