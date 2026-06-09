const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const CONFIG_PATH = path.join(__dirname, '../configs/camilladsp.yml');

/**
 * Generate a CamillaDSP configuration based on 7 wizard answers.
 *
 * Questions & Expected values:
 * 1. speakerSize: 'small' | 'medium' | 'large'
 * 2. hasSubwoofer: true | false
 * 3. distance: 'close' | 'medium' | 'far'
 * 4. roomAcoustics: 'live' (reflective) | 'neutral' | 'dead' (absorptive)
 * 5. soundSignature: 'flat' | 'v-shape' | 'warm'
 * 6. wallProximity: 'corner' | 'wall' | 'free'
 * 7. maxVolumeLimit: number (0-100)
 * 8. subsonicFilter: boolean
 * 9. nightMode: boolean
 * 10. lrBalance: number (-10 to 10)
 */
function generateDSPConfig(answers) {
  // Base configuration
  const config = {
    devices: {
      samplerate: 44100,
      chunksize: 1024,
      queuelimit: 4,
      capture: {
        type: 'Alsa',
        channels: 2,
        device: 'hw:Loopback,1,0',
        format: 'S16LE'
      },
      playback: {
        type: 'Alsa',
        channels: 2,
        device: 'hw:IanCanadaDAC',
        format: 'S32LE'
      }
    },
    filters: {},
    pipeline: [
      { type: 'Filter', channel: 0, names: [] },
      { type: 'Filter', channel: 1, names: [] }
    ]
  };

  const addFilter = (name, type, parameters, channel = 'both') => {
    config.filters[name] = { type, parameters };
    if (channel === 'both' || channel === 0) config.pipeline[0].names.push(name);
    if (channel === 'both' || channel === 1) config.pipeline[1].names.push(name);
  };

  // 1. & 2. Speaker Size and Subwoofer (High pass / Low pass)
  if (answers.speakerSize === 'small' && answers.hasSubwoofer) {
    addFilter('hp_crossover', 'Biquad', { type: 'Highpass', freq: 80, q: 0.707 });
  } else if (answers.speakerSize === 'small' && !answers.hasSubwoofer) {
    // Boost lower mids a bit to compensate for lack of bass on small speakers
    addFilter('bass_boost', 'Biquad', { type: 'Peaking', freq: 100, q: 1.0, gain: 3.0 });
  }

  // 3. Distance (Gain adjustment)
  let baseGain = 0;
  if (answers.distance === 'far') baseGain = 3;
  if (answers.distance === 'close') baseGain = -2;

  // 4. Room Acoustics (Treble adjustment)
  if (answers.roomAcoustics === 'live') {
    // Reflective room, reduce highs
    addFilter('treble_cut_room', 'Biquad', { type: 'Highshelf', freq: 6000, q: 0.707, gain: -2.0 });
  } else if (answers.roomAcoustics === 'dead') {
    // Absorptive room, boost highs
    addFilter('treble_boost_room', 'Biquad', { type: 'Highshelf', freq: 6000, q: 0.707, gain: 2.0 });
  }

  // 5. Sound Signature (EQ Profiles)
  if (answers.soundSignature === 'v-shape') {
    addFilter('eq_v_bass', 'Biquad', { type: 'Lowshelf', freq: 150, q: 0.707, gain: 4.0 });
    addFilter('eq_v_treble', 'Biquad', { type: 'Highshelf', freq: 8000, q: 0.707, gain: 3.0 });
    baseGain -= 2; // Headroom
  } else if (answers.soundSignature === 'warm') {
    addFilter('eq_warm_bass', 'Biquad', { type: 'Lowshelf', freq: 200, q: 0.707, gain: 2.0 });
    addFilter('eq_warm_highs', 'Biquad', { type: 'Highshelf', freq: 5000, q: 0.707, gain: -1.5 });
  }

  // 6. Wall Proximity (Boundary Gain Compensation)
  if (answers.wallProximity === 'corner') {
    addFilter('boundary_cut_corner', 'Biquad', { type: 'Lowshelf', freq: 150, q: 0.707, gain: -6.0 });
  } else if (answers.wallProximity === 'wall') {
    addFilter('boundary_cut_wall', 'Biquad', { type: 'Lowshelf', freq: 150, q: 0.707, gain: -3.0 });
  }

  // 7. Max Volume Limit / Overall Gain Calculation
  if (answers.maxVolumeLimit !== undefined) {
      // 100% = 0dB, 50% = -30dB
      const maxDb = (answers.maxVolumeLimit - 100) * 0.6;
      baseGain += maxDb;
  }

  addFilter('master_gain', 'Gain', { gain: baseGain, inverted: false });

  // 8. Subsonic Filter
  if (answers.subsonicFilter) {
    addFilter('subsonic_hp', 'Biquad', { type: 'Highpass', freq: 20, q: 0.707 });
  }

  // 9. Night Mode
  if (answers.nightMode) {
    addFilter('night_mode_bass_cut', 'Biquad', { type: 'Lowshelf', freq: 150, q: 0.707, gain: -8.0 });
    // Compress dynamic range slightly by boosting overall volume to hear quiet parts but limiting bass
    addFilter('night_mode_gain', 'Gain', { gain: 2.0, inverted: false });
  }

  // 10. L/R Balance
  if (answers.lrBalance !== 0 && answers.lrBalance !== undefined) {
    // If balance is negative, boost left (or cut right). We will cut the opposite channel to avoid clipping.
    if (answers.lrBalance < 0) {
       addFilter('balance_cut_right', 'Gain', { gain: answers.lrBalance, inverted: false }, 1); // Channel 1 = Right
    } else {
       addFilter('balance_cut_left', 'Gain', { gain: -answers.lrBalance, inverted: false }, 0); // Channel 0 = Left
    }
  }

  // Convert to YAML and save
  const yamlStr = YAML.stringify(config);
  fs.writeFileSync(CONFIG_PATH, yamlStr, 'utf8');
  console.log('DSP Configuration updated successfully.');

  return config;
}

module.exports = { generateDSPConfig };
