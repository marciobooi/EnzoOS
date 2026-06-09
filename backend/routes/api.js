const express = require('express');
const router = express.Router();

const dspController = require('../controllers/dspController');

// System state routes (mocked in server.js currently, but can be migrated later)
// router.get('/state', stateController.getState);
// router.post('/action', stateController.postAction);

// DSP Configuration / Wizard routes
router.post('/config-dsp', dspController.saveAndApplyConfig);
router.get('/presets', dspController.getPresets);

module.exports = router;
