// server/storage.js
// External storage: USB drive auto-play status/eject, and NAS (SMB/NFS) share
// management. Both end up browsable in the MPD library the same way: a
// symlink under music_directory pointing at the real mount, then a targeted
// `mpc update <name>`. MPD's own pluggable "mount" protocol command (nfs://,
// smb://, udisks://) looked like the more idiomatic route, but it requires a
// `cache_directory` that this project's packaged MPD 0.23.14 build doesn't
// actually support ("unrecognized parameter" — confirmed live) — so this
// falls back to the plain symlink-into-the-regular-library approach, which
// only needs `follow_outside_symlinks "yes"` in mpd.conf (see install.sh).
//
// USB: scripts/usb-automount.sh (run as root via a udev rule — see install.sh)
// does the actual udisksctl mount + creates the symlink on device insert;
// this file only reports status and handles eject. It also POSTs here on
// mount/remove so connected clients get a live update.
//
// NAS: mounting a network share needs root (mount.cifs/mount.nfs), so this
// runs those via sudo (scoped sudoers entries — see install.sh) and persists
// the share list (without passwords) in the settings table so
// remountPersistedNasShares() can bring them back on every boot.
import express from 'express';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { getSetting, setSetting } from './db.js';
import { emit } from './event-service.js';
import { sendError, badRequest } from './lib/errors.js';

const execPromise = promisify(exec);
const execFileP = promisify(execFile);
const router = express.Router();

const USB_MARKER = '/run/resonance-usb-mount';
const NAS_MOUNT_ROOT = '/mnt/resonance-nas';
const NAS_CRED_DIR = '/etc/resonance-nas-credentials';
const MPD_MUSIC_DIR = '/var/lib/mpd/music';

async function dfStats(mountPoint) {
  try {
    const { stdout } = await execPromise(`df -BM "${mountPoint}" --output=size,used,avail | tail -1`);
    const [sizeS, usedS, availS] = stdout.trim().split(/\s+/);
    const parse = s => parseInt(s, 10) || 0;
    return { totalMb: parse(sizeS), usedMb: parse(usedS), freeMb: parse(availS) };
  } catch {
    return { totalMb: 0, usedMb: 0, freeMb: 0 };
  }
}

// A symlink under music_directory + a targeted update — see the file header
// for why this replaced MPD's own mount/unmount/listmounts commands.
async function mpdMount(name, absPath) {
  const linkPath = path.join(MPD_MUSIC_DIR, name);
  try { fs.unlinkSync(linkPath); } catch {} // clear a stale symlink from a previous mount
  fs.symlinkSync(absPath, linkPath);
  await execFileP('mpc', ['update', name]).catch(() => {});
}
async function mpdUnmount(name) {
  const linkPath = path.join(MPD_MUSIC_DIR, name);
  try { fs.unlinkSync(linkPath); } catch {}
  // Full rescan (no path arg): the symlink is already gone, so a targeted
  // `update <name>` has nothing left to walk — only a full update reliably
  // prunes the now-missing subtree from the database.
  await execFileP('mpc', ['update']).catch(() => {});
}

// ── USB drive (auto-mounted by scripts/usb-automount.sh via udev) ───────────

router.get('/usb/status', async (req, res) => {
  try {
    const mounted = fs.existsSync(USB_MARKER);
    if (!mounted) return res.json({ mounted: false });
    const usbPath = fs.readFileSync(USB_MARKER, 'utf8').trim();
    if (!usbPath || !fs.existsSync(usbPath)) return res.json({ mounted: false });
    const stats = await dfStats(usbPath);
    res.json({ mounted: true, path: usbPath, label: path.basename(usbPath), ...stats });
  } catch (err) {
    sendError(res, err);
  }
});

// Called by scripts/usb-automount.sh (loopback only — see server/auth.js
// isLoopback) right after it mounts/unmounts, so connected clients update live.
router.post('/usb/notify', async (req, res) => {
  const { event, path: usbPath } = req.body || {};
  emit('USB_STORAGE', { mounted: event === 'mounted', path: usbPath || null });
  res.json({ success: true });
});

router.post('/usb/eject', async (req, res) => {
  try {
    if (!fs.existsSync(USB_MARKER)) return res.json({ success: true, ejected: false });
    const usbPath = fs.readFileSync(USB_MARKER, 'utf8').trim();
    await mpdUnmount('usb');
    if (usbPath) await execFileP('sudo', ['umount', usbPath]).catch(() => {});
    fs.unlinkSync(USB_MARKER);
    emit('USB_STORAGE', { mounted: false, path: null });
    res.json({ success: true, ejected: true });
  } catch (err) {
    sendError(res, err);
  }
});

// ── NAS shares (SMB/NFS) ──────────────────────────────────────────────────────

async function readNasShares() {
  try {
    const raw = await getSetting('nas_shares');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
async function writeNasShares(shares) {
  await setSetting('nas_shares', JSON.stringify(shares));
}

function slugify(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'share';
}

async function mountShare(share, password) {
  const mountPoint = path.join(NAS_MOUNT_ROOT, share.id);
  await execFileP('sudo', ['mkdir', '-p', mountPoint]).catch(() => {});

  if (share.type === 'smb') {
    const credPath = path.join(NAS_CRED_DIR, `${share.id}.cred`);
    // password is only non-null on initial add — remountPersistedNasShares()
    // passes null, since the credentials file (root-owned 600, written once
    // below) already survives on disk and must NOT be overwritten with an
    // empty password on every reboot.
    if (password !== null) {
      const credContent = `username=${share.username || 'guest'}\npassword=${password || ''}\n`;
      // Staged as a pi-owned tempfile, then installed into the root-owned
      // credentials dir atomically with the right mode in one sudo call —
      // Node itself never has write access to /etc/resonance-nas-credentials.
      const tempPath = path.join(os.tmpdir(), `resonance-nas-${share.id}.tmp`);
      fs.writeFileSync(tempPath, credContent, { mode: 0o600 });
      try {
        await execFileP('sudo', ['install', '-m', '600', tempPath, credPath]);
      } finally {
        fs.unlinkSync(tempPath);
      }
    }
    // `timeout` (not just execFile's own timeout option) is the difference
    // that matters here: a mount to a host that's silently unreachable
    // (dropped packets, not even "connection refused") leaves mount.cifs/
    // mount.nfs blocked in an uninterruptible kernel wait — SIGTERM alone
    // doesn't reliably reach through sudo into that state, but wrapping the
    // whole invocation in coreutils' timeout (which escalates to SIGKILL)
    // does. Verified live: an unreachable NFS host without this hung for
    // several minutes; with it, the route below gets its error back in ~20s.
    await execFileP('sudo', [
      'timeout', '20', 'mount', '-t', 'cifs', `//${share.host}/${share.share}`, mountPoint,
      '-o', `credentials=${credPath},uid=1000,gid=1000,iocharset=utf8,vers=3.0,ro`,
    ]);
  } else {
    // Deliberately not forcing nfsvers=4: tried it as a "fails faster on a
    // dead host" optimization, but it broke against this very test rig
    // ("Protocol not supported") — not every NFS server/client combo
    // supports it, and it's not worth the compatibility risk when the
    // `timeout` wrapper above already bounds the worst case either way.
    // Let the kernel negotiate whatever version the server actually offers.
    await execFileP('sudo', [
      'timeout', '20', 'mount', '-t', 'nfs', `${share.host}:/${share.share}`, mountPoint,
      '-o', 'ro,soft,timeo=30',
    ]);
  }
  await mpdMount(share.id, mountPoint);
}

async function unmountShare(share) {
  const mountPoint = path.join(NAS_MOUNT_ROOT, share.id);
  await mpdUnmount(share.id);
  await execFileP('sudo', ['umount', mountPoint]).catch(() => {});
  await execFileP('sudo', ['rmdir', mountPoint]).catch(() => {});
  if (share.type === 'smb') {
    const credPath = path.join(NAS_CRED_DIR, `${share.id}.cred`);
    await execFileP('sudo', ['rm', '-f', credPath]).catch(() => {});
  }
}

// Called once at server startup (see server/index.js) to bring back every
// saved share after a reboot — mount.cifs/mount.nfs don't persist across
// restarts on their own, and the credentials file survives on disk (only
// removed when the share itself is deleted), so this is a plain re-mount
// with no password re-entry needed. Waits for MPD itself, same reachability
// pattern as applyPersistedMpdSettings in player.js — this call is independent
// of that one so a share remount failure can't block crossfade/replaygain
// restore or vice versa.
export async function remountPersistedNasShares() {
  const shares = await readNasShares();
  if (!shares.length) return;

  let reachable = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    try { await execFileP('mpc', ['version']); reachable = true; break; }
    catch { await new Promise(r => setTimeout(r, 1000)); }
  }
  if (!reachable) { console.warn('[NAS] MPD not reachable at startup — skipping share remount.'); return; }

  for (const share of shares) {
    try {
      await mountShare(share, null); // SMB creds file already on disk from setup
      console.log(`[NAS] Remounted "${share.name}" at ${NAS_MOUNT_ROOT}/${share.id}`);
    } catch (err) {
      console.warn(`[NAS] Failed to remount "${share.name}":`, err.message);
    }
  }
}

router.get('/nas-shares', async (req, res) => {
  try {
    res.json({ shares: await readNasShares() });
  } catch (err) { sendError(res, err); }
});

router.post('/nas-shares', async (req, res) => {
  const { name, type, host, share: shareName, username, password } = req.body || {};
  if (!name || !host || !shareName) return sendError(res, badRequest('name, host and share are required'));
  if (!['smb', 'nfs'].includes(type)) return sendError(res, badRequest("type must be 'smb' or 'nfs'"));

  const shares = await readNasShares();
  const id = `${slugify(name)}-${crypto.randomBytes(2).toString('hex')}`;
  const entry = { id, name, type, host, share: shareName, username: type === 'smb' ? (username || '') : undefined };

  try {
    await mountShare(entry, password);
    shares.push(entry);
    await writeNasShares(shares);
    res.json({ success: true, share: entry });
  } catch (err) {
    console.error('[NAS] Mount failed:', err.message);
    // Best-effort cleanup of the now-orphaned empty mount-point dir (mkdir
    // succeeds before the mount attempt that just failed).
    execFileP('sudo', ['rmdir', path.join(NAS_MOUNT_ROOT, id)]).catch(() => {});
    sendError(res, err);
  }
});

router.delete('/nas-shares/:id', async (req, res) => {
  const shares = await readNasShares();
  const share = shares.find(s => s.id === req.params.id);
  if (!share) return sendError(res, badRequest('Unknown share id'));
  try {
    await unmountShare(share);
    await writeNasShares(shares.filter(s => s.id !== share.id));
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
