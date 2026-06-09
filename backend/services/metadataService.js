// This service aggregates metadata from MPD and Webhook integrations (Spotify/TIDAL/AirPlay)

class MetadataService {
  constructor() {
    this.state = {
      status: 'paused',
      volume: 50,
      source: 'mpd',
      track: {
        title: 'Ready to Play',
        artist: 'Hi-Fi Streamer',
        album: '',
        albumArtUrl: null
      },
      vuMeters: { left: -60, right: -60 }
    };

    this.broadcastCallback = null;
  }

  setBroadcastCallback(cb) {
    this.broadcastCallback = cb;
  }

  updateState(partialState) {
    this.state = { ...this.state, ...partialState };
    if (this.broadcastCallback) {
      this.broadcastCallback(this.state);
    }
  }

  getState() {
    return this.state;
  }
}

module.exports = new MetadataService();
