const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

async function ensureStorageFolders(userId) {
  await pool.query(
    `INSERT INTO file_folders (user_id, name, is_system, system_key, position)
     VALUES ($1, 'Photos', TRUE, 'photos', 0),
            ($1, 'Uploads Inbox', TRUE, 'uploads_inbox', 1)
     ON CONFLICT (user_id, system_key) WHERE system_key IS NOT NULL
     DO UPDATE SET name = EXCLUDED.name, is_system = TRUE`,
    [userId]
  );
}

const FILE_FAMILIES = new Set([
  'document', 'pdf', 'image', 'gif', 'audio', 'video', '3d', 'archive', 'data', 'other',
]);

function familySql(source) {
  if (['note', 'brain_dump', 'scribble', 'canvas', 'task'].includes(source)) return `'document'`;
  return `CASE
    WHEN LOWER(COALESCE(src.mime_type, '')) = 'application/pdf'
      OR LOWER(src.title) ~ '\\.pdf$' THEN 'pdf'
    WHEN LOWER(COALESCE(src.mime_type, '')) = 'image/gif'
      OR LOWER(src.title) ~ '\\.gif$' THEN 'gif'
    WHEN LOWER(COALESCE(src.mime_type, '')) LIKE 'image/%'
      OR LOWER(src.title) ~ '\\.(jpe?g|png|webp|avif|heic|heif|svg|bmp|tiff?)$' THEN 'image'
    WHEN LOWER(COALESCE(src.mime_type, '')) LIKE 'audio/%'
      OR LOWER(src.title) ~ '\\.(mp3|wav|m4a|aac|ogg|flac|opus|aiff?)$' THEN 'audio'
    WHEN LOWER(COALESCE(src.mime_type, '')) LIKE 'video/%'
      OR LOWER(src.title) ~ '\\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg)$' THEN 'video'
    WHEN LOWER(COALESCE(src.mime_type, '')) LIKE 'model/%'
      OR LOWER(src.title) ~ '\\.(glb|gltf|obj|fbx|stl|dae|mtl|blend|usdz)$' THEN '3d'
    WHEN LOWER(COALESCE(src.mime_type, '')) IN ('application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/gzip', 'application/x-tar')
      OR LOWER(src.title) ~ '\\.(zip|rar|7z|gz|tar|tgz)$' THEN 'archive'
    WHEN LOWER(COALESCE(src.mime_type, '')) IN ('text/csv', 'application/json', 'application/xml', 'text/xml', 'text/javascript', 'application/javascript')
      OR LOWER(src.title) ~ '\\.(csv|tsv|json|xml|ya?ml|js|mjs|cjs|ts|tsx|jsx|py|rb|php|java|c|cpp|h|hpp|css|sql|sh|ps1)$' THEN 'data'
    WHEN LOWER(COALESCE(src.mime_type, '')) LIKE 'text/%'
      OR LOWER(src.title) ~ '\\.(txt|md|rtf|docx?|odt|pages|pptx?|key|xlsx?|numbers)$' THEN 'document'
    ELSE 'other'
  END`;
}

const SOURCE_QUERIES = {
  note: `
    SELECT n.id AS source_id,
           COALESCE(NULLIF(n.title,''), 'Untitled note') AS title,
           n.updated_at,
           'text/plain' AS mime_type,
           NULL::bigint AS size_bytes,
           '/notes.html?returnTo=files#note-' || n.id AS app_url
      FROM notes n
     WHERE n.user_id = $1 AND n.is_archived = FALSE`,

  brain_dump: `
    SELECT b.id AS source_id,
           COALESCE(NULLIF(b.title,''), 'Untitled brain dump') AS title,
           b.updated_at,
           'text/plain' AS mime_type,
           NULL::bigint AS size_bytes,
           '/notes.html?returnTo=files#braindump-' || b.id AS app_url
      FROM brain_dumps b
     WHERE b.user_id = $1`,

  scribble: `
    SELECT s.id AS source_id,
           COALESCE(NULLIF(s.title,''), 'Untitled document') AS title,
           s.updated_at,
           'text/plain' AS mime_type,
           NULL::bigint AS size_bytes,
           '/scribble/editor.html?id=' || s.id || '&returnTo=files' AS app_url
      FROM scribbles s
     WHERE s.user_id = $1
       AND s.deleted_at IS NULL AND s.is_archived = FALSE`,

  canvas: `
    SELECT c.id AS source_id,
           COALESCE(NULLIF(c.title,''), 'Untitled canvas') AS title,
           c.updated_at,
           'application/canvas' AS mime_type,
           NULL::bigint AS size_bytes,
           '/canvas/edit.html?id=' || c.id || '&returnTo=files' AS app_url
      FROM canvases c
     WHERE c.user_id = $1
       AND c.deleted_at IS NULL AND c.is_archived = FALSE`,

  task: `
    SELECT t.id AS source_id,
           COALESCE(NULLIF(t.title,''), 'Untitled task') AS title,
           t.updated_at,
           'text/plain' AS mime_type,
           NULL::bigint AS size_bytes,
           '/tasks.html?returnTo=files#task-' || t.id AS app_url
      FROM pa_tasks t
     WHERE t.user_id = $1 AND t.status NOT IN ('done','cancelled')`,

  upload: `
    SELECT f.id AS source_id,
           f.original_name AS title,
           f.updated_at,
           COALESCE(f.mime_type, 'application/octet-stream') AS mime_type,
           f.size_bytes,
           CASE WHEN COALESCE(f.mime_type,'') LIKE 'image/%'
                THEN '/photos.html?file_id=' || f.id || '&returnTo=files'
                ELSE NULL END AS app_url
      FROM files f
     WHERE f.user_id = $1`,

  media: `
    SELECT a.id AS source_id,
           COALESCE(NULLIF(LEFT(a.prompt, 80), ''),
                    CASE WHEN a.kind = 'video' THEN 'Generated video' ELSE 'Generated image' END) AS title,
           a.created_at AS updated_at,
           a.mime AS mime_type,
           a.size_bytes,
           '/image-studio.html' AS app_url
      FROM media_assets a
      JOIN media_folders f ON f.id = a.folder_id AND f.user_id = a.user_id
     WHERE a.user_id = $1 AND f.system_key = 'generated'`,
};

const SOURCE_ICONS = {
  note:        '📝',
  brain_dump:  '🧠',
  scribble:    '✍️',
  canvas:      '🎨',
  task:        '✅',
  upload:      '📎',
  media:       '✦',
};

router.get('/all', async (req, res) => {
  const filter   = String(req.query.filter || 'all');
  const q        = String(req.query.q || '').trim();
  const folderId = req.query.folder_id ? String(req.query.folder_id) : null;
  const source   = req.query.source   ? String(req.query.source)    : null;
  const family   = FILE_FAMILIES.has(String(req.query.type || '')) ? String(req.query.type) : null;
  const limit    = Math.min(parseInt(req.query.limit, 10) || 300, 1000);

  const sources = source && SOURCE_QUERIES[source]
    ? [source]
    : Object.keys(SOURCE_QUERIES);

  try {
    
    const parts = [];
    const params = [req.userId];

    for (const src of sources) {
      const sq = SOURCE_QUERIES[src];
      parts.push(`
        SELECT '${src}' AS source,
               src.source_id,
               src.title,
               src.updated_at,
               src.mime_type,
               src.size_bytes,
               src.app_url,
               ${familySql(src)} AS file_family,
               fm.folder_id
          FROM (${sq}) src
          LEFT JOIN file_folder_members fm
            ON fm.user_id = $1
           AND fm.source = '${src}'
           AND fm.source_id = src.source_id
      `);
    }

    let sql = `SELECT * FROM (${parts.join(' UNION ALL ')}) all_docs WHERE 1=1`;
    let idx = 2;

    if (filter === 'local') { sql += ` AND FALSE`; }

    if (q.length >= 2) {
      const escaped = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      sql += ` AND title ILIKE $${idx}`;
      params.push('%' + escaped + '%');
      idx++;
    }

    if (folderId === 'none') {
      sql += ` AND folder_id IS NULL`;
    } else if (folderId) {
      sql += ` AND folder_id = $${idx}`;
      params.push(parseInt(folderId, 10));
      idx++;
    }

    if (family) {
      sql += ` AND file_family = $${idx}`;
      params.push(family);
      idx++;
    }

    sql += ` ORDER BY updated_at DESC NULLS LAST LIMIT $${idx}`;
    params.push(limit);

    const { rows } = await pool.query(sql, params);
    res.json(rows.map(r => ({
      source:       r.source,
      source_id:    r.source_id,
      title:        r.title,
      updated_at:   r.updated_at,
      mime_type:    r.mime_type,
      size_bytes:   r.size_bytes == null ? null : Number(r.size_bytes),
      file_family:  r.file_family,
      app_url:      r.app_url,
      folder_id:    r.folder_id || null,
      icon:         SOURCE_ICONS[r.source] || '📄',
      is_image:     (r.mime_type || '').startsWith('image/'),
      is_upload:    r.source === 'upload',
    })));
  } catch (err) {
    console.error('[files-unified] /all failed:', err.message);
    res.status(500).json({ error: 'Failed to load files' });
  }
});

router.get('/user-folders', async (req, res) => {
  try {
    await ensureStorageFolders(req.userId);
    const { rows } = await pool.query(
      `SELECT f.id, f.name, f.is_system, f.system_key, f.position, f.cover_thumb,
              COUNT(m.id)::int AS doc_count
         FROM file_folders f
         LEFT JOIN file_folder_members m ON m.folder_id = f.id
        WHERE f.user_id = $1
        GROUP BY f.id
        ORDER BY f.is_system DESC, f.position, f.name`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[files-unified] /user-folders GET failed:', err.message);
    res.status(500).json({ error: 'Failed to load folders' });
  }
});

router.post('/user-folders', async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO file_folders (user_id, name, is_system, position)
       VALUES ($1, $2, FALSE, (
         SELECT COALESCE(MAX(position),0)+1 FROM file_folders WHERE user_id=$1
       ))
       RETURNING id, name, is_system, system_key, position, cover_thumb`,
      [req.userId, name]
    );
    res.status(201).json({ ...rows[0], doc_count: 0 });
  } catch (err) {
    console.error('[files-unified] /user-folders POST failed:', err.message);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

router.delete('/user-folders/:id', async (req, res) => {
  const folderId = parseInt(req.params.id, 10);
  if (!Number.isInteger(folderId)) return res.status(400).json({ error: 'Bad id' });
  try {
    const check = await pool.query(
      `SELECT is_system FROM file_folders WHERE id = $1 AND user_id = $2`,
      [folderId, req.userId]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' });
    if (check.rows[0].is_system) return res.status(403).json({ error: 'Cannot delete system folder' });
    await pool.query(`DELETE FROM file_folders WHERE id = $1`, [folderId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[files-unified] /user-folders DELETE failed:', err.message);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

router.put('/user-folders/:id/cover', async (req, res) => {
  const folderId = parseInt(req.params.id, 10);
  if (!Number.isInteger(folderId)) return res.status(400).json({ error: 'Bad id' });
  let cover = req.body.cover_thumb;
  if (cover != null) {
    cover = String(cover);
    if (!/^data:image\//.test(cover)) return res.status(400).json({ error: 'cover_thumb must be an image data URL' });
    if (cover.length > 400 * 1024) return res.status(413).json({ error: 'Cover image too large (keep it a small thumbnail)' });
  } else {
    cover = null;   
  }
  try {
    const { rowCount } = await pool.query(
      `UPDATE file_folders SET cover_thumb = $1 WHERE id = $2 AND user_id = $3`,
      [cover, folderId, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Folder not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[files-unified] /cover PUT failed:', err.message);
    res.status(500).json({ error: 'Failed to set cover' });
  }
});

router.post('/user-folders/:id/add', async (req, res) => {
  const folderId = parseInt(req.params.id, 10);
  const { source, source_id } = req.body;
  if (!Number.isInteger(folderId) || !source || !source_id) {
    return res.status(400).json({ error: 'folder id, source, source_id required' });
  }
  if (!SOURCE_QUERIES[source]) return res.status(400).json({ error: 'invalid source' });
  try {
    const folderCheck = await pool.query(
      `SELECT id FROM file_folders WHERE id=$1 AND user_id=$2`,
      [folderId, req.userId]
    );
    if (!folderCheck.rows.length) return res.status(404).json({ error: 'Folder not found' });
    await pool.query(
      `INSERT INTO file_folder_members (user_id, folder_id, source, source_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, source, source_id)
       DO UPDATE SET folder_id = EXCLUDED.folder_id`,
      [req.userId, folderId, source, source_id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[files-unified] /add failed:', err.message);
    res.status(500).json({ error: 'Failed to assign folder' });
  }
});

router.delete('/user-folders/:id/remove', async (req, res) => {
  const folderId = parseInt(req.params.id, 10);
  const { source, source_id } = req.body;
  if (!Number.isInteger(folderId) || !source || !source_id) {
    return res.status(400).json({ error: 'folder id, source, source_id required' });
  }
  try {
    await pool.query(
      `DELETE FROM file_folder_members
       WHERE user_id=$1 AND folder_id=$2 AND source=$3 AND source_id=$4`,
      [req.userId, folderId, source, source_id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[files-unified] /remove failed:', err.message);
    res.status(500).json({ error: 'Failed to remove from folder' });
  }
});

module.exports = router;
