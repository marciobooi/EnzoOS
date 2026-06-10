const express = require('express');
const router = express.Router();

const dspController = require('../controllers/dspController');
const networkController = require('../controllers/networkController');
const stateController = require('../controllers/stateController');
const systemController = require('../controllers/systemController');
const radioController = require('../controllers/radioController');

// Webhook to receive metadata updates from external services (Spotify/AirPlay)
router.post('/metadata/webhook', stateController.updateMetadataWebhook);

// DSP Configuration / Wizard routes
router.post('/config-dsp', dspController.saveAndApplyConfig);
router.get('/presets', dspController.getPresets);

// Network routes
router.get('/network/status', networkController.getNetworkStatus);
router.get('/network/scan', networkController.scanWifi);
router.post('/network/connect', networkController.connectWifi);

// System OTA & Settings routes
router.post('/system/update', systemController.triggerOTAUpdate);
router.get('/system/settings', systemController.getSettings);
router.post('/system/settings', systemController.updateSettings);

// Web Radio routes
router.get('/radio/search', radioController.searchRadio);
router.post('/radio/play', radioController.playRadio);

module.exports = router;
