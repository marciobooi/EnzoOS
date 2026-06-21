import express from 'express';
import { login, requireAuth } from './auth.js';

const router = express.Router();

// POST /api/auth/login — exchange username/password for a signed bearer token.
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const token = await login(username, password);
    if (!token) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ success: true, token });
  } catch (err) {
    console.error('[Auth] Login failed:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/check — verify the caller's token is still valid (or loopback).
// requireAuth answers this: 200 if authorized, 401 otherwise.
router.get('/check', requireAuth, (req, res) => {
  res.json({ success: true });
});

export default router;
