const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/installed', async (req, res) => {
  try {
    const userId = req.userId;

    const result = await db.query(
      `SELECT 
        up.id,
        up.plugin_id,
        up.status,
        up.installed_at,
        p.name,
        p.version,
        p.manifest
      FROM user_plugins up
      JOIN plugins p ON up.plugin_id = p.id
      WHERE up.user_id = $1
      ORDER BY up.installed_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      plugins: result.rows,
    });
  } catch (err) {
    console.error('[plugins/installed]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/install', async (req, res) => {
  try {
    const { plugin_id } = req.body;
    const userId = req.userId;

    if (!plugin_id) {
      return res.status(400).json({ success: false, error: 'plugin_id required' });
    }

    const pluginCheck = await db.query(
      'SELECT id FROM plugins WHERE id = $1',
      [plugin_id]
    );

    if (pluginCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Plugin not found' });
    }

    const result = await db.query(
      `INSERT INTO user_plugins (user_id, plugin_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (user_id, plugin_id)
       DO UPDATE SET status = 'active', installed_at = NOW()
       RETURNING *`,
      [userId, plugin_id]
    );

    res.json({
      success: true,
      plugin: result.rows[0],
    });
  } catch (err) {
    console.error('[plugins/install]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/uninstall', async (req, res) => {
  try {
    const { plugin_id } = req.body;
    const userId = req.userId;

    if (!plugin_id) {
      return res.status(400).json({ success: false, error: 'plugin_id required' });
    }

    const result = await db.query(
      `DELETE FROM user_plugins
       WHERE user_id = $1 AND plugin_id = $2
       RETURNING *`,
      [userId, plugin_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Plugin not installed' });
    }

    await db.query(
      `DELETE FROM plugin_data
       WHERE user_id = $1 AND plugin_id = $2`,
      [userId, plugin_id]
    );

    res.json({
      success: true,
      message: 'Plugin uninstalled and data cleared',
    });
  } catch (err) {
    console.error('[plugins/uninstall]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/data', async (req, res) => {
  try {
    const { id: pluginId } = req.params;
    const userId = req.userId;

    const result = await db.query(
      `SELECT store_key, data, updated_at
       FROM plugin_data
       WHERE user_id = $1 AND plugin_id = $2
       ORDER BY updated_at DESC`,
      [userId, pluginId]
    );

    const dataMap = {};
    result.rows.forEach((row) => {
      dataMap[row.store_key] = row.data;
    });

    res.json({
      success: true,
      plugin_id: pluginId,
      data: dataMap,
    });
  } catch (err) {
    console.error('[plugins/:id/data GET]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/data', async (req, res) => {
  try {
    const { id: pluginId } = req.params;
    const { store_key, data } = req.body;
    const userId = req.userId;

    if (!store_key) {
      return res.status(400).json({ success: false, error: 'store_key required' });
    }

    const installed = await db.query(
      `SELECT id FROM user_plugins
       WHERE user_id = $1 AND plugin_id = $2`,
      [userId, pluginId]
    );

    if (installed.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Plugin not installed' });
    }

    const result = await db.query(
      `INSERT INTO plugin_data (user_id, plugin_id, store_key, data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, plugin_id, store_key)
       DO UPDATE SET data = $4, updated_at = NOW()
       RETURNING *`,
      [userId, pluginId, store_key, JSON.stringify(data)]
    );

    res.json({
      success: true,
      saved: result.rows[0],
    });
  } catch (err) {
    console.error('[plugins/:id/data POST]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
