const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { cloudUsageForUser } = require('../lib/cloud-storage');
const { withdrawSourceRecord } = require('../lib/memory-source-events');
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { folder } = req.query;
  try {
    let query = `SELECT f.id, f.user_id, f.original_name, f.mime_type, f.size_bytes,
                        f.folder, f.description, f.origin_kind, FALSE AS is_shared, f.download_count,
                        f.created_at, f.updated_at, COALESCE(u.name, 'Unknown') AS uploaded_by
                   FROM files f
                   LEFT JOIN users u ON u.id = f.user_id
                  WHERE f.user_id = $1`;
    const values = [req.userId];
    if (folder) { query += ` AND f.folder = $2`; values.push(folder); }
    query += ' ORDER BY f.created_at DESC LIMIT 100';
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to list files' }); }
});

router.get('/usage', requireAuth, async (req, res) => {
  try {
    res.json(await cloudUsageForUser(req.userId));
  } catch (err) {
    console.error('[FILES] usage:', err.message);
    res.status(500).json({ error: 'Failed to load usage' });
  }
});

router.get('/folders', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT folder FROM files WHERE user_id = $1 ORDER BY folder`,
      [req.userId]
    );
    res.json(result.rows.map(r => r.folder));
  } catch (err) { res.status(500).json({ error: 'Failed to list folders' }); }
});

router.post('/', requireAuth, async (req, res) => {
  const { filename, content, mime_type, folder, folder_id, description } = req.body;
  if (!filename || !content) return res.status(400).json({ error: 'filename and content required' });
  const sizeBytes = Buffer.byteLength(content, 'base64');
  if (sizeBytes > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large (10MB max)' });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    
    await client.query(`SELECT pg_advisory_xact_lock($1::bigint)`, [req.userId]);
    const usage = await cloudUsageForUser(req.userId, client);
    if (usage.used + sizeBytes > usage.quota) {
      await client.query('ROLLBACK');
      return res.status(413).json({
        error: 'Storage limit reached',
        detail: 'Free up space or upgrade to PASS.',
        code: 'storage_cap_reached',
        used_bytes: usage.used,
        cap_bytes: usage.quota,
        would_use_bytes: usage.used + sizeBytes,
      });
    }
    const appOutputFolders = new Set(['Beats', 'Comedy']);
    const originKind = appOutputFolders.has(folder) ? 'app_output' : 'external_upload';
    let destination = null;
    if (originKind === 'external_upload' && folder_id != null) {
      const chosen = await client.query(
        `SELECT id, name FROM file_folders WHERE id = $1 AND user_id = $2`,
        [parseInt(folder_id, 10), req.userId]
      );
      if (!chosen.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Destination folder not found' });
      }
      destination = chosen.rows[0];
    }
    const storageFolder = destination ? destination.name
      : (folder || (originKind === 'external_upload' ? 'Uploads Inbox' : 'General'));
    const storedName = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const result = await client.query(
      `INSERT INTO files
         (user_id, filename, original_name, mime_type, size_bytes, folder, description, origin_kind, is_shared, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9)
       RETURNING id, original_name, folder, origin_kind, created_at, is_shared`,
      [req.userId, storedName, filename, mime_type || 'application/octet-stream',
        sizeBytes, storageFolder, description || null, originKind, content]
    );
    if (originKind === 'external_upload') {
      let destinationId = destination ? destination.id : null;
      if (destinationId == null) {
        const inbox = await client.query(
          `INSERT INTO file_folders (user_id, name, is_system, system_key, position)
           VALUES ($1, 'Uploads Inbox', TRUE, 'uploads_inbox', 1)
           ON CONFLICT (user_id, system_key) WHERE system_key IS NOT NULL
           DO UPDATE SET name = EXCLUDED.name, is_system = TRUE
           RETURNING id`,
          [req.userId]
        );
        destinationId = inbox.rows[0].id;
      }
      await client.query(
        `INSERT INTO file_folder_members (user_id, folder_id, source, source_id)
         VALUES ($1, $2, 'upload', $3)
         ON CONFLICT (user_id, source, source_id)
         DO UPDATE SET folder_id = EXCLUDED.folder_id`,
        [req.userId, destinationId, result.rows[0].id]
      );
    }
    await client.query('COMMIT');

    try {
      const logResult = await pool.query(
        `INSERT INTO daily_logs (user_id, log_date) VALUES ($1, CURRENT_DATE) ON CONFLICT (user_id, log_date) DO UPDATE SET updated_at = NOW() RETURNING id`,
        [req.userId]
      );
      await pool.query(
        `INSERT INTO log_entries (daily_log_id, user_id, entry_type, content) VALUES ($1, $2, 'auto', $3)`,
        [logResult.rows[0].id, req.userId, `Uploaded file: "${filename}" to ${storageFolder}`]
      );
    } catch (e) {  }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[FILES] Upload error:', err.message);
    res.status(500).json({ error: 'Upload failed' });
  } finally {
    if (client) client.release();
  }
});

router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT original_name, mime_type, content FROM files WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
    
    await pool.query(`UPDATE files SET download_count = download_count + 1 WHERE id = $1`, [req.params.id]);
    const file = result.rows[0];
    res.json({ filename: file.original_name, mime_type: file.mime_type, content: file.content });
  } catch (err) { res.status(500).json({ error: 'Download failed' }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const file = await client.query('SELECT user_id FROM files WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (file.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    if (file.rows[0].user_id !== req.userId && !req.isAdmin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized' });
    }
    await withdrawSourceRecord(client, {
      userId:file.rows[0].user_id,
      sourceType:'upload',
      sourceRecordId:String(req.params.id),
    });
    await client.query('DELETE FROM files WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: 'Delete failed' });
  } finally {
    client.release();
  }
});

module.exports = router;
