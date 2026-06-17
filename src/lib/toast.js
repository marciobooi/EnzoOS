// Minimal singleton toast bus — no React dependency, drop-in sonner API replacement.
const listeners = new Set();
let toasts = [];
let nextId = 0;

function notify() {
  listeners.forEach(fn => fn([...toasts]));
}

export function subscribe(fn) {
  listeners.add(fn);
  fn([...toasts]);
  return () => listeners.delete(fn);
}

function dismiss(id) {
  toasts = toasts.map(t => t.id === id ? { ...t, exiting: true } : t);
  notify();
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    notify();
  }, 280);
}

function add(type, message, duration = 3500) {
  const id = ++nextId;
  toasts = [...toasts, { id, type, message, exiting: false }];
  notify();
  setTimeout(() => dismiss(id), duration);
  return id;
}

export const toast = {
  success: (message, opts) => add('success', message, opts?.duration),
  error:   (message, opts) => add('error',   message, opts?.duration),
};
