import express from 'express';
import { generateQrToken, redeemQrToken, redeemPairCode, requireAuth, isLoopback } from './auth.js';
import { sendError, forbidden, unauthorized } from './lib/errors.js';

const router = express.Router();

// GET /api/auth/qr-token — kiosk only (loopback-trusted origin).
// Returns a fresh short-lived token so the kiosk can build a QR URL.
router.get('/qr-token', (req, res) => {
  if (!isLoopback(req)) return sendError(res, forbidden('kiosk only'));
  res.json(generateQrToken());
});

// POST /api/auth/qr-redeem — public (the remote page calls this before it has a token).
// Exchange a QR token embedded in the scan URL for a long-lived bearer token.
router.post('/qr-redeem', async (req, res) => {
  const { token: qrToken } = req.body || {};
  try {
    const bearer = await redeemQrToken(qrToken);
    if (!bearer) {
      return sendError(res, unauthorized('QR code is invalid or has expired — scan a fresh one from the kiosk.'));
    }
    res.json({ success: true, token: bearer });
  } catch (err) {
    sendError(res, err, req);
  }
});

// POST /api/auth/pair-code — public. Manual-entry fallback for qr-redeem:
// exchanges the 6-digit code shown alongside the QR for the same bearer
// token a successful scan would produce. Needed because on iOS, once the
// remote's been added to the home screen, tapping a scanned link matching
// its manifest scope gets routed into the *installed app* at its fixed
// start_url — silently dropping the ?qr=<token> query string the scan flow
// depends on. Typing the code in from inside the already-open app never
// involves a URL navigation, so it works regardless of that behavior.
router.post('/pair-code', async (req, res) => {
  const { code } = req.body || {};
  try {
    const bearer = await redeemPairCode(typeof code === 'string' ? code.trim() : code);
    if (!bearer) {
      return sendError(res, unauthorized('That code is invalid or has expired — check the kiosk for a fresh one.'));
    }
    res.json({ success: true, token: bearer });
  } catch (err) {
    sendError(res, err, req);
  }
});

// GET /api/auth/check — verify the caller's token is still valid (or loopback).
router.get('/check', requireAuth, (req, res) => {
  res.json({ success: true });
});

export default router;
