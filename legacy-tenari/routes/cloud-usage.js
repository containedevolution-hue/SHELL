const express = require('express');
const { requireAuth, touchSession } = require('../middleware/auth');
const { cloudUsageForUser } = require('../lib/cloud-storage');
const router = express.Router();

router.get('/usage', requireAuth, touchSession, async (req, res) => {
  try {
    res.json(await cloudUsageForUser(req.userId));
  } catch (err) {
    console.error('[cloud-usage] failed:', err.message);
    res.status(500).json({ error: 'Failed to compute cloud usage' });
  }
});

module.exports = router;
