const { exec } = require('child_process');
const { generateDSPConfig } = require('./dspConfigGenerator');
const { getDb } = require('../db/database');

// Saves a preset and generates the config
async function saveAndApplyConfig(req, res) {
  try {
    const answers = req.body;
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid input payload' });
    }

    // Input sanitization
    const presetName = (req.body.presetName || 'Default Wizard Setup').toString().substring(0, 50).replace(/[^a-zA-Z0-9 _-]/g, '');

    // Generate the CamillaDSP YAML structure (and write to file inside the generator)
    const newConfig = generateDSPConfig(answers);

    // Save to SQLite database
    const db = await getDb();
    await db.run(
      'INSERT INTO dsp_presets (name, config) VALUES (?, ?)',
      [presetName, JSON.stringify(answers)]
    );

    // Restart the CamillaDSP service to apply the new config
    exec('sudo systemctl restart camilladsp', (error, stdout, stderr) => {
      if (error) {
        console.error('Error restarting CamillaDSP:', error);
        return res.json({
          success: true,
          message: 'Config generated and saved to DB, but restart failed. Ensure sudoers is correct.',
          error: error.message,
          config: newConfig
        });
      }

      console.log('CamillaDSP service restarted successfully');
      res.json({ success: true, message: 'DSP Configuration saved to DB, generated, and applied successfully', config: newConfig });
    });

  } catch (err) {
    console.error('Error in DSP Controller:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to process DSP config' });
  }
}

// Retrieves all saved presets from the DB
async function getPresets(req, res) {
  try {
    const db = await getDb();
    const presets = await db.all('SELECT id, name, created_at, config FROM dsp_presets ORDER BY created_at DESC');

    // Parse JSON config strings back to objects for the frontend
    const parsedPresets = presets.map(p => ({
      ...p,
      config: JSON.parse(p.config)
    }));

    res.json({ success: true, presets: parsedPresets });
  } catch (err) {
    console.error('Error fetching presets:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch presets' });
  }
}

module.exports = {
  saveAndApplyConfig,
  getPresets
};
