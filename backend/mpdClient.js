/**
 * Mock MPD Client
 * In a real implementation, this would use `mpc-js` or similar
 * to communicate with the local MPD server.
 */

class MPDClient {
  constructor() {
    this.connected = false;
  }

  connect() {
    console.log('Connecting to MPD...');
    this.connected = true;
    return Promise.resolve(true);
  }

  play() {
    console.log('MPD: Play');
    return Promise.resolve();
  }

  pause() {
    console.log('MPD: Pause');
    return Promise.resolve();
  }

  next() {
    console.log('MPD: Next');
    return Promise.resolve();
  }

  previous() {
    console.log('MPD: Previous');
    return Promise.resolve();
  }

  getStatus() {
    return Promise.resolve({
      state: 'play',
      volume: 100
    });
  }
}

module.exports = new MPDClient();
