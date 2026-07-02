# App stack — exact versions (package.json, verified on VM 2026-07)

Node 20.20.2 (NodeSource). **Plain JS/JSX — no TypeScript anywhere.**

## Backend
| Pkg | Ver | Gotchas for this codebase |
|---|---|---|
| **express** | **5.2.1** | This is Express **5**, not 4: routes use path-to-regexp v8 (`*` wildcards must be named — `/*splat`; `?`/`+` modifiers gone); **async handlers that reject are auto-forwarded to the error handler** (no need for try/catch+next in new code, but keep the existing `sendError` style); `req.query` is a getter (non-writable); `res.status()` rejects non-integers. Docs: expressjs.com/en/guide/migrating-5.html |
| ws | 8.21 | Server in `server/websocket.js` (upgrade + bearer auth via `isWsAuthorized`); also used as **client** to CamillaDSP (`ws://localhost:1234`) — currently one socket per command (TODO §9.2: make persistent) |
| sqlite3 | 6.0.1 | Callback API promise-wrapped by hand in `server/db.js`; single connection, WAL + 5s busy-timeout. No ORM. `?` placeholders only |
| express-rate-limit | 8.5 | `sensitiveLimiter` guards destructive routes (OTA route still missing it — TODO §1) |
| node-fetch | 3.x (ESM) | dynamic `import()` where used; undici advisory pending `npm audit fix` (TODO §5) |
| dotenv | 17 | `.env` written by install.sh; see TODO §8.1 for the Tidal-vars wipe bug |
| yaml | 2.4 | serializes the CamillaDSP config (should be a committed dep, not `npm install yaml` at install time — TODO §8.1) |

## Frontend
| Pkg | Ver | Gotchas |
|---|---|---|
| **react / react-dom** | **19.2** | React 19: `ref` as prop (no forwardRef needed for new code), `use()` hook, stricter effects — but match existing hook patterns; render-body side effects are bugs (see TODO §3 SystemAdminOverlay) |
| **vite** | **8.0** | Vite 8 = **rolldown** bundler (OTA log confirms). Config `vite.config.js`; build output `dist/` served by Express static |
| @vitejs/plugin-react | 6 | |
| **tailwindcss + @tailwindcss/vite** | **4.3** | Tailwind **v4**: no `tailwind.config.js` — theme/config live in CSS (`src/index.css` via `@theme`); utilities auto-generated; don't create a JS config |
| lucide-react | 1.17 | icon set |
| qrcode.react | 4.2 | remote-pairing QR |

## Conventions that override library defaults
- All state mutations go through `server/event-service.js` `emit()` (serial queue → cache → persist → broadcast). Never mutate state ad-hoc.
- Errors: `AppError`/`sendError`/`errorHandler` from `server/lib/errors.js` — no bare `res.status().json()`.
- Client WS: `src/websocket.js` `useResonanceWS` — every server broadcast type needs a handler here AND state setters passed correctly (see TODO §2 SET_VOLUME bug for the failure mode).
- Kiosk (`pages/Kiosk.jsx`) and Remote (`pages/RemoteControl.jsx`) duplicate control logic — fix bugs in BOTH (EFFICIENCY.md §2).
- i18n: `en.js`/`pt.js` must stay 1:1.
