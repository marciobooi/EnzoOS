// ─── Central error handling for the API ───────────────────────────────────────
// One place to define how errors are shaped, logged and sent to clients.
//
// Usage patterns:
//   • Throw inside an asyncHandler-wrapped route:
//       router.get('/x', asyncHandler(async (req, res) => {
//         requireFields(req.query, ['id']);
//         const row = await find(req.query.id);
//         if (!row) throw notFound('Item not found');
//         res.json(row);
//       }));
//   • Or, inside an existing try/catch, normalise the response:
//       catch (err) { sendError(res, err); }
//
// Every error ultimately becomes JSON: { error, code, details? } with the right
// HTTP status. 5xx messages are never leaked to clients; 4xx messages are.

export class AppError extends Error {
  constructor(message, { status = 500, code = 'internal_error', details = null, expose } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    // 4xx are client-facing and safe to echo; 5xx are masked — unless a caller
    // explicitly opts in (e.g. upstream-service messages on a 502).
    this.expose = expose ?? status < 500;
  }
}

// ── Factory helpers ───────────────────────────────────────────────────────────
export const badRequest   = (message = 'Bad request', details) => new AppError(message, { status: 400, code: 'bad_request', details });
export const unauthorized = (message = 'Unauthorized')          => new AppError(message, { status: 401, code: 'unauthorized' });
export const forbidden    = (message = 'Forbidden')             => new AppError(message, { status: 403, code: 'forbidden' });
export const notFound     = (message = 'Not found')             => new AppError(message, { status: 404, code: 'not_found' });
export const conflict     = (message = 'Conflict')              => new AppError(message, { status: 409, code: 'conflict' });
export const serverError  = (message = 'Internal server error', details) => new AppError(message, { status: 500, code: 'internal_error', details });
// Upstream/integration failure (MPD, Tidal, Qobuz, Spotify…). The message is
// exposed because it describes the external service, not our internals.
export const badGateway   = (message = 'Upstream service error', details) => new AppError(message, { status: 502, code: 'bad_gateway', details, expose: true });

// ── Validation ────────────────────────────────────────────────────────────────
// Throws badRequest if any of `fields` is missing/blank on `obj`.
export function requireFields(obj, fields) {
  const missing = fields.filter((f) => {
    const v = obj?.[f];
    return v === undefined || v === null || v === '';
  });
  if (missing.length) {
    throw badRequest(`Missing required field(s): ${missing.join(', ')}`, { fields: missing });
  }
}

// Throws badRequest unless `value` is one of `allowed`.
export function requireOneOf(value, allowed, label = 'value') {
  if (!allowed.includes(value)) {
    throw badRequest(`Invalid ${label}: must be one of ${allowed.join(', ')}`, { allowed });
  }
}

// ── Normalisation + sending ───────────────────────────────────────────────────
// Coerce any thrown value into an AppError.
export function toAppError(err) {
  if (err instanceof AppError) return err;
  const message = (err && err.message) ? err.message : String(err || 'Unknown error');
  return new AppError(message, { status: 500, code: 'internal_error' });
}

// Send a normalised JSON error response. Safe to call from any catch block.
export function sendError(res, err, req = null) {
  const e = toAppError(err);
  if (e.status >= 500) {
    const where = req ? `${req.method} ${req.originalUrl}` : 'API';
    console.error(`[API] ${where} →`, err);
  }
  res.status(e.status).json({
    error: e.expose ? e.message : 'Internal server error',
    code: e.code,
    ...(e.details ? { details: e.details } : {}),
  });
}

// ── Express plumbing ──────────────────────────────────────────────────────────
// Wrap an async route handler so rejected promises reach the error middleware.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Final Express error-handling middleware (must be registered after all routes,
// and must keep all four args so Express recognises it as an error handler).
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  sendError(res, err, req);
}
