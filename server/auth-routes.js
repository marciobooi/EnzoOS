import express from 'express';
import { generateQrToken, redeemQrToken, requireAuth, isLoopback } from './auth.js';

const router = express.Router();

// GET /api/auth/qr-token — kiosk only (loopback-trusted origin).
// Returns a fresh short-lived token so the kiosk can build a QR URL.
router.get('/qr-token', (req, res) => {
  if (!isLoopback(req)) return res.status(403).json({ error: 'kiosk only' });
  res.json(generateQrToken());
});

// POST /api/auth/qr-redeem — public (the remote page calls this before it has a token).
// Exchange a QR token embedded in the scan URL for a long-lived bearer token.
router.post('/qr-redeem', async (req, res) => {
  const { token: qrToken } = req.body || {};
  try {
    const bearer = await redeemQrToken(qrToken);
    if (!bearer) {
      return res.status(401).json({ error: 'QR code is invalid or has expired — scan a fresh one from the kiosk.' });
    }
    res.json({ success: true, token: bearer });
  } catch (err) {
    console.error('[Auth] qr-redeem failed:', err.message);
    res.status(500).json({ error: 'Redeem failed' });
  }
});

// GET /api/auth/check — verify the caller's token is still valid (or loopback).
router.get('/check', requireAuth, (req, res) => {
  res.json({ success: true });
});

export default router;
