// System: OTA update, health/services, power, storage, Wi-Fi, factory reset.
import { handleJson } from './_client';

export const systemApi = {
  /** Fetches the system OTA update status. */
  async getUpdateStatus() {
    const response = await fetch('/api/system/update/status');
    return handleJson(response, 'System update status request failed.');
  },

  /** Triggers the system OTA update execution. */
  async triggerUpdate() {
    const response = await fetch('/api/system/update', { method: 'POST' });
    return handleJson(response, 'Failed to trigger OTA update.');
  },

  /** Fetch local CPU, RAM and Wi-Fi system telemetry. */
  async getSystemHealth() {
    const response = await fetch('/api/system/update/health');
    return handleJson(response);
  },

  async getServices() {
    const r = await fetch('/api/system/services');
    return handleJson(r);
  },

  async restartService(name) {
    const r = await fetch(`/api/system/service/${encodeURIComponent(name)}/restart`, { method: 'POST' });
    return handleJson(r);
  },

  async rebootSystem() {
    const r = await fetch('/api/system/reboot', { method: 'POST' });
    return handleJson(r);
  },

  async shutdownSystem() {
    const r = await fetch('/api/system/shutdown', { method: 'POST' });
    return handleJson(r);
  },

  // ── Storage / Wi-Fi / factory reset ───────────────────────────────────────────
  async getStorage() {
    const r = await fetch('/api/system/storage');
    return handleJson(r);
  },
  async getWifi() {
    const r = await fetch('/api/system/wifi');
    return handleJson(r);
  },
  async scanWifi() {
    const r = await fetch('/api/system/wifi/scan');
    return handleJson(r);
  },
  async connectWifi(ssid, password) {
    const r = await fetch('/api/system/wifi/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssid, password }),
    });
    return handleJson(r);
  },
  async factoryReset() {
    const r = await fetch('/api/system/factory-reset', { method: 'POST' });
    return handleJson(r);
  },

  // ── Onboarding (first-boot welcome wizard) ────────────────────────────────────
  async getOnboarding() {
    const r = await fetch('/api/system/onboarding');
    return handleJson(r);
  },
  async setOnboarding(complete) {
    const r = await fetch('/api/system/onboarding', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complete }),
    });
    return handleJson(r);
  },

  // ── Language / locale ─────────────────────────────────────────────────────────
  async getLanguage() {
    const r = await fetch('/api/system/language');
    return handleJson(r);
  },
  async setLanguage(language) {
    const r = await fetch('/api/system/language', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language }),
    });
    return handleJson(r);
  },

  // ── Timezone ───────────────────────────────────────────────────────────────────
  async getTimezone() {
    const r = await fetch('/api/system/timezone');
    return handleJson(r);
  },
  async setTimezone(timezone) {
    const r = await fetch('/api/system/timezone', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone }),
    });
    return handleJson(r);
  },
};
