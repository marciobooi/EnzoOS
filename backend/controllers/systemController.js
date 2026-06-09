const { exec } = require('child_process');
const { getDb } = require('../db/database');

async function triggerOTAUpdate(req, res) {
  // Acknowledge the request immediately so the frontend knows it started
  res.json({ success: true, message: 'OTA Update initiated. The system will restart shortly.' });

  console.log('Initiating OTA Update via script...');

  exec('sudo /opt/hifi-streamer/scripts/update.sh', (error, stdout, stderr) => {
    if (error) {
      console.error('OTA Update failed:', error);
      console.error('Stderr:', stderr);
      return;
    }
    console.log('OTA Update output:', stdout);
  });
}

// System Settings Logic (Themes, etc)
async function getSettings(req, res) {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT key, value FROM system_settings');
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);

    // Defaults if not set
    if (!settings.theme) settings.theme = 'dark-minimalist';
    if (!settings.vuMeterStyle) settings.vuMeterStyle = 'digital';

    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch system settings' });
  }
}

async function updateSettings(req, res) {
  try {
    const db = await getDb();
    const { theme, vuMeterStyle } = req.body;

    if (theme) {
      await db.run('INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=?', ['theme', theme, theme]);
    }
    if (vuMeterStyle) {
      await db.run('INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=?', ['vuMeterStyle', vuMeterStyle, vuMeterStyle]);
    }

    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
}

module.exports = {
  triggerOTAUpdate,
  getSettings,
  updateSettings
};
