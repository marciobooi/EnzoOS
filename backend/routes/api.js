const express = require('express');
const router = express.Router();

const dspController = require('../controllers/dspController');
const networkController = require('../controllers/networkController');
const stateController = require('../controllers/stateController');

// Webhook to receive metadata updates from external services (Spotify/AirPlay)
router.post('/metadata/webhook', stateController.updateMetadataWebhook);

// DSP Configuration / Wizard routes
router.post('/config-dsp', dspController.saveAndApplyConfig);
router.get('/presets', dspController.getPresets);

// Network routes
router.get('/network/status', networkController.getNetworkStatus);
router.get('/network/scan', networkController.scanWifi);
router.post('/network/connect', networkController.connectWifi);

module.exports = router;
