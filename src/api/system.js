// System: OTA update, health/services, power, storage, Wi-Fi, factory reset.
export const systemApi = {
  /** Fetches the system OTA update status. */
  async getUpdateStatus() {
    const response = await fetch('/api/system/update/status');
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('Failed to parse update status.');
    }
    if (!response.ok) {
      throw new Error(data?.error || 'System update status request failed.');
    }
    return data;
  },

  /** Triggers the system OTA update execution. */
  async triggerUpdate() {
    const response = await fetch('/api/system/update', { method: 'POST' });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('Failed to parse update command response.');
    }
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to trigger OTA update.');
    }
    return data;
  },

  /** Fetch local CPU, RAM and Wi-Fi system telemetry. */
  async getSystemHealth() {
    const response = await fetch('/api/system/update/health');
    return response.json();
  },

  async getServices() {
    const r = await fetch('/api/system/services');
    return r.json();
  },

  async restartService(name) {
    const r = await fetch(`/api/system/service/${encodeURIComponent(name)}/restart`, { method: 'POST' });
    return r.json();
  },

  async rebootSystem() {
    const r = await fetch('/api/system/reboot', { method: 'POST' });
    return r.json();
  },

  async shutdownSystem() {
    const r = await fetch('/api/system/shutdown', { method: 'POST' });
    return r.json();
  },

  // ── Storage / Wi-Fi / factory reset ───────────────────────────────────────────
  async getStorage() {
    const r = await fetch('/api/system/storage');
    return r.json();
  },
  async getWifi() {
    const r = await fetch('/api/system/wifi');
    return r.json();
  },
  async scanWifi() {
    const r = await fetch('/api/system/wifi/scan');
    return r.json();
  },
  async connectWifi(ssid, password) {
    const r = await fetch('/api/system/wifi/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssid, password }),
    });
    return r.json();
  },
  async factoryReset() {
    const r = await fetch('/api/system/factory-reset', { method: 'POST' });
    return r.json();
  },

  // ── Onboarding (first-boot welcome wizard) ────────────────────────────────────
  async getOnboarding() {
    const r = await fetch('/api/system/onboarding');
    return r.json();
  },
  async setOnboarding(complete) {
    const r = await fetch('/api/system/onboarding', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complete }),
    });
    return r.json();
  },

  // ── Language / locale ─────────────────────────────────────────────────────────
  async getLanguage() {
    const r = await fetch('/api/system/language');
    return r.json();
  },
  async setLanguage(language) {
    const r = await fetch('/api/system/language', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language }),
    });
    return r.json();
  },
};
