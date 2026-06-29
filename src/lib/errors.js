// ─── Central error handling for the frontend ──────────────────────────────────
// One place to turn anything thrown (Error, fetch Response, API { error } body,
// or a plain string) into a user-facing message, and to surface it as a toast.
// This is also the single hook to later add remote logging (Sentry, etc.).
import { toast } from './toast';

// Normalise any thrown value into a readable string.
export function getErrorMessage(err, fallback = 'Something went wrong') {
  if (err == null) return fallback;
  if (typeof err === 'string') return err || fallback;
  // Our backend sends { error, code }; some libraries use { message }.
  if (typeof err === 'object') {
    if (typeof err.error === 'string') return err.error;
    if (typeof err.message === 'string' && err.message) return err.message;
  }
  return fallback;
}

// Parse a fetch Response into an Error carrying the backend's { error, code }.
// Use in api modules: `if (!r.ok) throw await toApiError(r);`
export async function toApiError(response, fallback) {
  let body = null;
  try { body = await response.clone().json(); } catch { /* non-JSON body */ }
  const message = body?.error || fallback || `Request failed (${response.status})`;
  const err = new Error(message);
  err.status = response.status;
  if (body?.code) err.code = body.code;
  if (body?.details) err.details = body.details;
  return err;
}

// Report an error: log it and show a toast. Pass a localized `fallback` (e.g.
// t('source.searchFailed')) for the case where the error carries no message.
// Returns the resolved message so callers can reuse it.
export function reportError(err, fallback) {
  const message = getErrorMessage(err, fallback);
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  toast.error(message);
  return message;
}
