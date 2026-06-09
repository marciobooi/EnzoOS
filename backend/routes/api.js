const express = require('express');
const router = express.Router();

const dspController = require('../controllers/dspController');
const networkController = require('../controllers/networkController');

// System state routes (mocked in server.js currently, but can be migrated later)
// router.get('/state', stateController.getState);
// router.post('/action', stateController.postAction);

// DSP Configuration / Wizard routes
router.post('/config-dsp', dspController.saveAndApplyConfig);
router.get('/presets', dspController.getPresets);

// Network routes
router.get('/network/status', networkController.getNetworkStatus);
router.get('/network/scan', networkController.scanWifi);
router.post('/network/connect', networkController.connectWifi);

module.exports = router;
