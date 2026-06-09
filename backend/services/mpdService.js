const { MPC } = require('mpc-js');

class MPDService {
  constructor() {
    this.mpc = new MPC();
    this.onMetadataChange = null;
    this.isConnected = false;
  }

  connect() {
    this.mpc.connectTCP('localhost', 6600)
      .then(() => {
        console.log('Connected to MPD Server');
        this.isConnected = true;
        this.fetchCurrentStatus();
      })
      .catch(err => console.error('Failed to connect to MPD:', err));

    this.mpc.on('changed-player', () => {
      this.fetchCurrentStatus();
    });
  }

  async fetchCurrentStatus() {
    if (!this.isConnected) return;
    try {
      const status = await this.mpc.status.status();
      const currentSong = await this.mpc.status.currentSong();

      const payload = {
        source: 'mpd',
        status: status.state, // 'play', 'pause', 'stop'
        volume: status.volume,
        track: {
          title: currentSong?.title || currentSong?.name || 'Unknown Title',
          artist: currentSong?.artist || 'Unknown Artist',
          album: currentSong?.album || 'Unknown Album',
          // MPD doesn't natively expose a URL for album art without additional HTTP setups,
          // but we leave the property ready. In a real scenario, we could use Last.fm API to fetch this.
          albumArtUrl: null
        }
      };

      if (this.onMetadataChange) {
        this.onMetadataChange(payload);
      }
    } catch (err) {
      console.error('Error fetching MPD status:', err);
    }
  }

  play() { if (this.isConnected) this.mpc.playback.play(); }
  pause() { if (this.isConnected) this.mpc.playback.pause(); }
  next() { if (this.isConnected) this.mpc.playback.next(); }
  previous() { if (this.isConnected) this.mpc.playback.previous(); }
  setVolume(vol) { if (this.isConnected) this.mpc.playback.setVol(vol); }
}

module.exports = new MPDService();
