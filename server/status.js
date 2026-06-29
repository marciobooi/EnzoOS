import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getFullStatus } from './event-service.js';
import { sendError } from './lib/errors.js';

const execP  = promisify(exec);
const router = express.Router();

/**
 * GET /api/status
 *
 * Returns the full system state in one atomic snapshot. Clients call this on
 * connect/reconnect to hydrate all state at once instead of waiting for the
 * multi-message WS handshake sequence.
 *
 * For local source: live MPD position/duration/track are injected so the
 * snapshot reflects the exact moment of the request.
 */
router.get('/', async (req, res) => {
  try {
    const status = await getFullStatus();

    if (status.source === 'local' || status.source === 'radio') {
      try {
        const [curOut, statOut] = await Promise.all([
          execP('mpc -f "%title%\\n%artist%\\n%album%\\n%file%" current').catch(() => ({ stdout: '' })),
          execP('mpc status').catch(() => ({ stdout: '' })),
        ]);

        const lines      = (curOut.stdout  || '').trim().split('\n');
        const statusText = statOut.stdout  || '';
        const isPlaying  = statusText.includes('[playing]');

        // Parse elapsed/total: "  #1/1   1:23/4:56 (28%)"
        const timeMatch = statusText.match(/(\d+):(\d+)\/(\d+):(\d+)/);
        const toMs      = (m, s) => (Number(m) * 60 + Number(s)) * 1000;

        status.playback.paused   = !isPlaying;
        status.playback.position = timeMatch ? toMs(timeMatch[1], timeMatch[2]) : 0;
        status.playback.duration = timeMatch ? toMs(timeMatch[3], timeMatch[4]) : 0;

        // For local source, override track info with live MPD data (more accurate
        // than the DB snapshot used for initial radio state restoration)
        if (status.source === 'local') {
          const [title, artist, album, file] = lines;
          if (title || file) {
            status.playback.track = {
              name:     title  || (file ? file.split('/').pop().replace(/\.[^.]+$/, '') : 'Unknown'),
              artist:   artist || '',
              album:    album  || '',
              albumArt: '',
              uri:      file   || '',
              radioUrl: null,
            };
          }
        }
      } catch {
        // MPD query failed — non-fatal, return cached state
      }
    }

    res.json(status);
  } catch (err) {
    sendError(res, err, req);
  }
});

export default router;
