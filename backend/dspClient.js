/**
 * Mock CamillaDSP Client
 * In a real implementation, this would connect to the CamillaDSP
 * WebSocket API to fetch and set volume, DSP configurations, etc.
 */

class CamillaDSPClient {
  constructor() {
    this.connected = false;
  }

  connect() {
    console.log('Connecting to CamillaDSP...');
    this.connected = true;
    return Promise.resolve(true);
  }

  setVolume(level) {
    console.log(`CamillaDSP: Setting volume to ${level} dB`);
    return Promise.resolve();
  }

  getVolume() {
    return Promise.resolve(-20.0);
  }
}

module.exports = new CamillaDSPClient();
