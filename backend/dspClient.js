const WebSocket = require('ws');
const metadataService = require('./services/metadataService');

/**
 * CamillaDSP WebSocket Client
 * Connects to CamillaDSP native WebSocket API on port 1234
 * Fetches real-time RMS signal levels for the VU Meters.
 */
class CamillaDSPClient {
  constructor() {
    this.ws = null;
    this.intervalId = null;
    this.reconnectTimeout = null;
  }

  connect() {
    console.log('Connecting to CamillaDSP WebSocket on ws://127.0.0.1:1234...');
    this.ws = new WebSocket('ws://127.0.0.1:1234');

    this.ws.on('open', () => {
      console.log('Connected to CamillaDSP Engine.');

      // Request Playback RMS every 100ms
      this.intervalId = setInterval(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify("GetPlaybackSignalRms"));
        }
      }, 100);
    });

    this.ws.on('message', (data) => {
      try {
        const response = JSON.parse(data);

        // CamillaDSP returns: { "GetPlaybackSignalRms": { "value": [-20.5, -22.1] } }
        if (response.GetPlaybackSignalRms && response.GetPlaybackSignalRms.value) {
          const channels = response.GetPlaybackSignalRms.value;

          // Fallback to -60dB if silence
          const left = channels[0] !== undefined ? channels[0] : -60;
          const right = channels[1] !== undefined ? channels[1] : -60;

          metadataService.updateState({
            vuMeters: { left, right }
          });
        }
      } catch (e) {
        // Ignore parse errors silently
      }
    });

    this.ws.on('error', (err) => {
      console.error('CamillaDSP WS Error:', err.message);
    });

    this.ws.on('close', () => {
      console.log('CamillaDSP WebSocket closed. Reconnecting in 5s...');
      clearInterval(this.intervalId);
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
    });
  }
}

module.exports = new CamillaDSPClient();
