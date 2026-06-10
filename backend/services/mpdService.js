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

      const title = currentSong?.title || currentSong?.name || 'Unknown Title';
      const artist = currentSong?.artist || 'Unknown Artist';
      const album = currentSong?.album || 'Unknown Album';

      let albumArtUrl = null;

      // Smart Scraping for Album Art via MusicBrainz/CoverArtArchive if available
      // Note: We only try to scrape if we have a valid artist and album, avoiding rate limits on junk data
      if (artist !== 'Unknown Artist' && album !== 'Unknown Album') {
         albumArtUrl = await this.scrapeAlbumArt(artist, album);
      }

      const payload = {
        source: 'mpd',
        status: status.state, // 'play', 'pause', 'stop'
        volume: status.volume,
        track: { title, artist, album, albumArtUrl }
      };

      if (this.onMetadataChange) {
        this.onMetadataChange(payload);
      }
    } catch (err) {
      console.error('Error fetching MPD status:', err);
    }
  }

  async scrapeAlbumArt(artist, album) {
    try {
       // Search MusicBrainz for the release group
       const mbQuery = encodeURIComponent(`artist:"${artist}" AND release:"${album}"`);
       const mbRes = await fetch(`https://musicbrainz.org/ws/2/release?query=${mbQuery}&fmt=json`, {
          headers: { 'User-Agent': 'EnzoOS-HiFiStreamer/1.0.0 ( DIY Audio )' }
       });

       if (!mbRes.ok) return null;

       const mbData = await mbRes.json();
       if (mbData.releases && mbData.releases.length > 0) {
           const releaseId = mbData.releases[0].id;
           // Query CoverArtArchive
           const caaRes = await fetch(`https://coverartarchive.org/release/${releaseId}`);
           if (caaRes.ok) {
               const caaData = await caaRes.json();
               if (caaData.images && caaData.images.length > 0) {
                   return caaData.images[0].image; // Returns highest quality available
               }
           }
       }
       return null;
    } catch (e) {
       console.error('Album art scraping failed:', e.message);
       return null;
    }
  }

  play() { if (this.isConnected) this.mpc.playback.play(); }
  pause() { if (this.isConnected) this.mpc.playback.pause(); }
  next() { if (this.isConnected) this.mpc.playback.next(); }
  previous() { if (this.isConnected) this.mpc.playback.previous(); }
  setVolume(vol) { if (this.isConnected) this.mpc.playback.setVol(vol); }

  async playStream(url) {
    if (this.isConnected) {
       try {
         await this.mpc.currentPlaylist.clear();
         await this.mpc.currentPlaylist.add(url);
         await this.mpc.playback.play();
       } catch (e) {
         console.error('Error playing web stream:', e);
       }
    }
  }
}

module.exports = new MPDService();
