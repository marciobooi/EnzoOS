// English (default / fallback locale). Keys are dot-namespaced; any key missing
// from another locale falls back to the value here, so partial translations are
// always safe.
export default {
  lang: {
    title: 'Language',
    subtitle: 'Choose your language',
    english: 'English',
    portuguese: 'Português',
  },

  common: {
    back: 'Back',
    next: 'Next',
    skip: 'Skip',
    cancel: 'Cancel',
    close: 'Close',
    save: 'Save',
    done: 'Done',
    connect: 'Connect',
    connected: 'Connected',
    connecting: 'Connecting…',
    signIn: 'Sign in',
    on: 'On',
    off: 'Off',
    openLink: 'Open link',
    recommended: 'Recommended',
  },

  nav: {
    player: 'Player',
    source: 'Source',
    library: 'Library',
    radio: 'Radio',
    search: 'Search',
    settings: 'Settings',
  },

  wizard: {
    welcome: {
      title: 'Welcome to Resonance HiFi',
      body: 'Your Raspberry Pi is now a high-fidelity network streamer with real-time DSP. Let’s connect your music and get you listening — it only takes a moment.',
    },
    connect: {
      title: 'Connect your music',
      body: 'Link your streaming accounts now, or skip and do it later from Source. AirPlay, Bluetooth, UPnP/DLNA, web radio and your local library need no setup.',
      spotifyHint: 'Spotify Connect + Web playback',
      tidalHint: 'Hi-Res FLAC · device login',
      qobuzHint: 'Hi-Res FLAC · email & password',
      qobuzUser: 'Email / username',
      qobuzPass: 'Password',
      qobuzError: 'Enter your email and password',
      tidalPrompt: 'Open {url} and enter:',
    },
    sound: {
      title: 'Shape your sound',
      body: 'Pick how audio is processed. You can change this any time and fine-tune everything in Settings → Acoustic.',
      eq: 'Manual Equalizer',
      eqHint: 'Presets + parametric tone control',
      room: 'Room Correction',
      roomHint: 'Harman curve + room calibration',
      pure: 'Pure Direct',
      pureHint: 'Flat, bit-perfect — no processing',
      roomTip: 'Tip: fine-tune room correction with the guided 8-question wizard in Settings → Acoustic.',
    },
    phone: {
      title: 'Control from your phone',
      bodyUrl: 'Open this address on any phone or tablet on your network, or scan the QR code from the kiosk’s Remote card:',
      bodyNoUrl: 'From the kiosk, tap the Remote card to show a QR code and control playback from any phone or tablet on your network.',
    },
    done: {
      title: 'You’re all set',
      body: 'Tune the sound any time in Settings — EQ, room correction, balance, bit-perfect and more. Enjoy the music.',
      cta: 'Get Started',
    },
  },

  settings: {
    runWizard: 'Run Setup Wizard',
    language: 'Language',
    sound: 'Sound',
    spotify: 'Spotify',
    services: 'Services',
    system: 'System',
    connectSpotify: 'Connect with Spotify',
    disconnect: 'Disconnect',
    confirm: 'Tap again to confirm',
    backup: 'Backup Settings',
    restore: 'Restore Settings',
    factoryReset: 'Factory Reset',
    wifi: 'Wi-Fi',
    storage: 'Storage',
  },
};
