'use strict';

const crypto = require('crypto');
const pool = require('../db');
const sealed = require('./fetch-crypto');

const LAB_STATES = new Set(['active', 'archived', 'deleted']);
const VISIBILITIES = new Set(['indexed', 'incognito']);
const LIVE_SEARCH_MODES = new Set(['off', 'automatic', 'ask']);
const AUTONOMY_MODES = new Set(['proceed', 'ask']);
const CATEGORY_SLUGS = new Set(['explore', 'live-research', 'fact-check', 'compare', 'deep-dive', 'fun']);

function clean(value, limit = 4000) {
  return String(value == null ? '' : value).trim().slice(0, limit);
}

function normalizeTerm(value) {
  return clean(value, 160)
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shapeRecord(value = {}) {
  return {
    title:clean(value.title, 160) || 'Untitled Lab',
    objective:clean(value.objective, 2000),
    scope:clean(value.scope, 4000),
    summary:clean(value.summary, 30000),
    decisions:Array.isArray(value.decisions) ? value.decisions.slice(0, 100) : [],
    findings:Array.isArray(value.findings) ? value.findings.slice(0, 250) : [],
    evidence:Array.isArray(value.evidence) ? value.evidence.slice(0, 500) : [],
    tables:Array.isArray(value.tables) ? value.tables.slice(0, 50) : [],
    artifacts:Array.isArray(value.artifacts) ? value.artifacts.slice(0, 100) : [],
    openQuestions:Array.isArray(value.openQuestions) ? value.openQuestions.slice(0, 100) : [],
    categoryHistory:Array.isArray(value.categoryHistory) ? value.categoryHistory.slice(0, 250) : [],
  };
}

function shapeLabBody(value = {}) {
  return {
    title:clean(value.title, 160) || 'Untitled Lab',
    libraryTitle:clean(value.libraryTitle, 160),
  };
}

function categoryView(row) {
  return {
    id:row.id,
    slug:row.slug,
    name:row.system_name,
    description:row.system_description,
    capabilities:row.capability_keys || [],
  };
}

async function categories(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT id,slug,system_name,system_description,capability_keys,is_system,
            content_ciphertext,content_iv,content_tag
       FROM fetch_categories
      WHERE enabled
        AND (user_id IS NULL OR user_id = $1)
      ORDER BY is_system DESC, created_at`,
    [userId]
  );
  const out = [];
  for (const row of rows) {
    if (row.is_system) out.push(categoryView(row));
    else {
      const body = await sealed.openValue(userId, row, db);
      out.push({
        id:row.id,
        slug:row.slug,
        name:clean(body.name, 120),
        description:clean(body.description, 500),
        capabilities:row.capability_keys || [],
      });
    }
  }
  return out;
}

async function categoryBySlug(userId, slug, db) {
  const safeSlug = CATEGORY_SLUGS.has(slug) ? slug : 'explore';
  const { rows } = await db.query(
    `SELECT id,slug,system_name,system_description,capability_keys
       FROM fetch_categories
      WHERE slug = $1 AND enabled AND (user_id IS NULL OR user_id = $2)
      ORDER BY user_id NULLS FIRST LIMIT 1`,
    [safeSlug, userId]
  );
  if (!rows[0]) throw new Error('fetch_category_unavailable');
  return rows[0];
}

async function allocateLabNumber(userId, client) {
  const { rows } = await client.query(
    `INSERT INTO fetch_lab_counters (user_id, next_number)
     VALUES ($1, 2)
     ON CONFLICT (user_id) DO UPDATE
       SET next_number = fetch_lab_counters.next_number + 1,
           updated_at = NOW()
     RETURNING next_number - 1 AS lab_number`,
    [userId]
  );
  return Number(rows[0].lab_number);
}

async function createLab(userId, values = {}, db = pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const number = await allocateLabNumber(userId, client);
    const category = await categoryBySlug(userId, clean(values.category, 40), client);
    const visibility = values.incognito === true ? 'incognito' : 'indexed';
    const title = clean(values.title, 160) || `Lab ${String(number).padStart(3, '0')}`;
    const labBody = await sealed.sealValue(userId, shapeLabBody({ title }), client);
    const recordBody = await sealed.sealValue(userId, shapeRecord({ title, objective:values.objective }), client);
    const { rows } = await client.query(
      `INSERT INTO fetch_labs
        (user_id,lab_number,state,visibility,active_category_id,
         content_ciphertext,content_iv,content_tag)
       VALUES ($1,$2,'active',$3,$4,$5,$6,$7)
       RETURNING id,lab_number,state,visibility,active_category_id,created_at,updated_at`,
      [userId, number, visibility, category.id,
       labBody.content_ciphertext, labBody.content_iv, labBody.content_tag]
    );
    const lab = rows[0];
    const recordResult = await client.query(
      `INSERT INTO fetch_lab_records
        (user_id,lab_id,content_ciphertext,content_iv,content_tag)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id,version,locked,created_at,updated_at`,
      [userId, lab.id, recordBody.content_ciphertext, recordBody.content_iv, recordBody.content_tag]
    );
    await client.query(
      `INSERT INTO fetch_lab_category_events (user_id,lab_id,category_id)
       VALUES ($1,$2,$3)`,
      [userId, lab.id, category.id]
    );
    await client.query('COMMIT');
    return {
      ...lab,
      title,
      displayId:`Lab ${String(number).padStart(3, '0')}`,
      category:categoryView(category),
      record:{ ...recordResult.rows[0], ...shapeRecord({ title, objective:values.objective }) },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function openLabs(userId, rows, db) {
  const out = [];
  for (const row of rows) {
    const body = await sealed.openValue(userId, row, db);
    out.push({
      id:row.id,
      labNumber:Number(row.lab_number),
      displayId:`Lab ${String(row.lab_number).padStart(3, '0')}`,
      title:clean(body.title, 160) || `Lab ${String(row.lab_number).padStart(3, '0')}`,
      libraryTitle:clean(body.libraryTitle, 160),
      state:row.state,
      visibility:row.visibility,
      category:row.category_slug ? {
        id:row.active_category_id,
        slug:row.category_slug,
        name:row.category_name,
        description:row.category_description,
        capabilities:row.capability_keys || [],
      } : null,
      createdAt:row.created_at,
      updatedAt:row.updated_at,
    });
  }
  return out;
}

async function listLabs(userId, { state, includeDeleted = false } = {}, db = pool) {
  const requested = LAB_STATES.has(state) ? state : null;
  const { rows } = await db.query(
    `SELECT l.*,c.slug AS category_slug,c.system_name AS category_name,
            c.system_description AS category_description,c.capability_keys
       FROM fetch_labs l
       LEFT JOIN fetch_categories c ON c.id = l.active_category_id
      WHERE l.user_id = $1
        AND ($2::text IS NULL OR l.state = $2)
        AND ($3::boolean OR l.state <> 'deleted')
      ORDER BY l.updated_at DESC, l.lab_number DESC`,
    [userId, requested, includeDeleted]
  );
  return openLabs(userId, rows, db);
}

async function ownedLabRow(userId, labId, db, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT l.*,c.slug AS category_slug,c.system_name AS category_name,
            c.system_description AS category_description,c.capability_keys
       FROM fetch_labs l
       LEFT JOIN fetch_categories c ON c.id = l.active_category_id
      WHERE l.user_id = $1 AND l.id = $2${lock ? ' FOR UPDATE OF l' : ''}`,
    [userId, labId]
  );
  return rows[0] || null;
}

async function getRecord(userId, labId, db = pool) {
  const { rows } = await db.query(
    `SELECT r.* FROM fetch_lab_records r
      WHERE r.user_id = $1 AND r.lab_id = $2`,
    [userId, labId]
  );
  if (!rows[0]) return null;
  const body = await sealed.openValue(userId, rows[0], db);
  return {
    id:rows[0].id,
    version:Number(rows[0].version),
    locked:rows[0].locked,
    createdAt:rows[0].created_at,
    updatedAt:rows[0].updated_at,
    ...shapeRecord(body),
  };
}

async function listTaxonomy(userId, labId, db = pool) {
  const { rows } = await db.query(
    `SELECT t.*,lt.confidence,lt.category_id
       FROM fetch_lab_taxonomy lt
       JOIN fetch_taxonomy_terms t
         ON t.user_id = lt.user_id AND t.id = lt.term_id
      WHERE lt.user_id = $1 AND lt.lab_id = $2
      ORDER BY t.updated_at DESC`,
    [userId, labId]
  );
  const out = [];
  for (const row of rows) {
    const body = await sealed.openValue(userId, row, db);
    out.push({
      id:row.id,
      label:clean(body.label, 160),
      aliases:Array.isArray(body.aliases) ? body.aliases : [],
      confidence:row.confidence == null ? null : Number(row.confidence),
      corrected:row.corrected,
      categoryId:row.category_id,
    });
  }
  return out;
}

async function getLab(userId, labId, db = pool) {
  const row = await ownedLabRow(userId, labId, db);
  if (!row) return null;
  const [lab] = await openLabs(userId, [row], db);
  const record = await getRecord(userId, labId, db);
  const taxonomy = await listTaxonomy(userId, labId, db);
  let messages = [];
  if (row.state !== 'deleted') {
    const result = await db.query(
      `SELECT id,role,content_ciphertext,content_iv,content_tag,created_at
         FROM fetch_lab_messages
        WHERE user_id = $1 AND lab_id = $2 ORDER BY created_at,id`,
      [userId, labId]
    );
    for (const message of result.rows) {
      const body = await sealed.openValue(userId, message, db);
      messages.push({ id:message.id, role:message.role, text:clean(body.text, 30000), createdAt:message.created_at });
    }
  }
  const categoryEvents = [];
  if (row.state !== 'deleted') {
    const result = await db.query(
      `SELECT e.id,e.category_id,e.reason_ciphertext,e.reason_iv,e.reason_tag,e.created_at,
              c.slug,c.system_name,c.system_description
         FROM fetch_lab_category_events e
         JOIN fetch_categories c ON c.id = e.category_id
        WHERE e.user_id = $1 AND e.lab_id = $2 ORDER BY e.created_at,e.id`,
      [userId, labId]
    );
    for (const event of result.rows) {
      const reason = event.reason_ciphertext
        ? await sealed.openValue(userId, {
            content_ciphertext:event.reason_ciphertext,
            content_iv:event.reason_iv,
            content_tag:event.reason_tag,
          }, db)
        : {};
      categoryEvents.push({
        id:event.id,
        categoryId:event.category_id,
        slug:event.slug,
        name:event.system_name,
        description:event.system_description,
        reason:clean(reason.reason, 1000),
        createdAt:event.created_at,
      });
    }
  }
  return { ...lab, record, taxonomy, messages, categoryEvents };
}

async function renameLab(userId, labId, values = {}, db = pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const row = await ownedLabRow(userId, labId, client, { lock:true });
    if (!row) { await client.query('ROLLBACK'); return null; }
    if (row.state === 'deleted') throw new Error('fetch_lab_locked');
    const current = await sealed.openValue(userId, row, client);
    const title = Object.prototype.hasOwnProperty.call(values, 'title')
      ? clean(values.title, 160)
      : clean(current.title, 160);
    const libraryTitle = Object.prototype.hasOwnProperty.call(values, 'libraryTitle')
      ? clean(values.libraryTitle, 160)
      : clean(current.libraryTitle, 160);
    if (!title) throw new Error('fetch_lab_title_required');
    const body = await sealed.sealValue(userId, { title, libraryTitle }, client);
    await client.query(
      `UPDATE fetch_labs
          SET content_ciphertext=$3,content_iv=$4,content_tag=$5,updated_at=NOW()
        WHERE user_id=$1 AND id=$2`,
      [userId, labId, body.content_ciphertext, body.content_iv, body.content_tag]
    );
    const record = await getRecord(userId, labId, client);
    if (record && !record.locked && record.title !== title) {
      const next = await sealed.sealValue(userId, shapeRecord({ ...record, title }), client);
      await client.query(
        `UPDATE fetch_lab_records
            SET version=version+1,content_ciphertext=$3,content_iv=$4,content_tag=$5,updated_at=NOW()
          WHERE user_id=$1 AND lab_id=$2 AND NOT locked`,
        [userId, labId, next.content_ciphertext, next.content_iv, next.content_tag]
      );
    }
    await client.query('COMMIT');
    return { title, libraryTitle };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function addMessage(userId, labId, role, text, db = pool) {
  if (!['user', 'fetch', 'system'].includes(role)) throw new Error('fetch_message_role_invalid');
  const lab = await ownedLabRow(userId, labId, db);
  if (!lab) return null;
  if (lab.state !== 'active') throw new Error('fetch_lab_not_active');
  const body = await sealed.sealValue(userId, { text:clean(text, 30000) }, db);
  const { rows } = await db.query(
    `INSERT INTO fetch_lab_messages
      (user_id,lab_id,role,content_ciphertext,content_iv,content_tag)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id,role,created_at`,
    [userId, labId, role, body.content_ciphertext, body.content_iv, body.content_tag]
  );
  await db.query(`UPDATE fetch_labs SET updated_at = NOW() WHERE user_id = $1 AND id = $2`, [userId, labId]);
  return { id:rows[0].id, role, text:clean(text, 30000), createdAt:rows[0].created_at };
}

async function addRawSource(userId, labId, source, db = pool) {
  const lab = await ownedLabRow(userId, labId, db);
  if (!lab || lab.state !== 'active') throw new Error('fetch_lab_not_active');
  const body = await sealed.sealValue(userId, {
    title:clean(source.title, 500),
    content:clean(source.content, 20000),
    evidenceKind:clean(source.evidenceKind, 40),
    readStatus:clean(source.readStatus, 80),
  }, db);
  const { rows } = await db.query(
    `INSERT INTO fetch_lab_raw_sources
      (user_id,lab_id,public_url,source_type,content_ciphertext,content_iv,content_tag)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id,public_url,source_type,created_at`,
    [userId, labId, clean(source.url, 2000) || null, clean(source.sourceType, 80) || 'web',
     body.content_ciphertext, body.content_iv, body.content_tag]
  );
  return rows[0];
}

async function upsertTerm(userId, input, client) {
  const label = clean(input.label, 160);
  const identity = normalizeTerm(input.canonical || label);
  if (!identity) return null;
  const fingerprint = await sealed.fingerprint(userId, 'fetch-taxonomy-term', identity, client);
  const aliases = Array.from(new Set((Array.isArray(input.aliases) ? input.aliases : [])
    .map(alias => clean(alias, 160)).filter(Boolean))).slice(0, 32);
  const content = await sealed.sealValue(userId, { label, aliases, identity, provenance:input.provenance || null }, client);
  const { rows } = await client.query(
    `INSERT INTO fetch_taxonomy_terms
      (user_id,identity_fingerprint,content_ciphertext,content_iv,content_tag)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id,identity_fingerprint) DO UPDATE
       SET content_ciphertext = EXCLUDED.content_ciphertext,
           content_iv = EXCLUDED.content_iv,
           content_tag = EXCLUDED.content_tag,
           updated_at = NOW()
     RETURNING id`,
    [userId, fingerprint, content.content_ciphertext, content.content_iv, content.content_tag]
  );
  await client.query(`DELETE FROM fetch_taxonomy_aliases WHERE user_id = $1 AND term_id = $2`, [userId, rows[0].id]);
  for (const alias of aliases) {
    const aliasIdentity = normalizeTerm(alias);
    if (!aliasIdentity || aliasIdentity === identity) continue;
    const aliasFingerprint = await sealed.fingerprint(userId, 'fetch-taxonomy-term', aliasIdentity, client);
    await client.query(
      `INSERT INTO fetch_taxonomy_aliases (user_id,term_id,alias_fingerprint)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id,alias_fingerprint) DO NOTHING`,
      [userId, rows[0].id, aliasFingerprint]
    );
  }
  return { id:rows[0].id, identity, label };
}

async function replaceTaxonomy(userId, labId, terms, client) {
  await client.query(`DELETE FROM fetch_lab_taxonomy WHERE user_id = $1 AND lab_id = $2`, [userId, labId]);
  const resolved = new Map();
  for (const input of (Array.isArray(terms) ? terms : []).slice(0, 128)) {
    const term = await upsertTerm(userId, input || {}, client);
    if (!term) continue;
    resolved.set(term.identity, term);
    await client.query(
      `INSERT INTO fetch_lab_taxonomy (user_id,lab_id,term_id,confidence)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id,lab_id,term_id) DO UPDATE
         SET confidence = EXCLUDED.confidence, updated_at = NOW()`,
      [userId, labId, term.id, Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : null]
    );
  }
  for (const input of (Array.isArray(terms) ? terms : []).slice(0, 128)) {
    const child = resolved.get(normalizeTerm(input.canonical || input.label));
    const parent = resolved.get(normalizeTerm(input.parent));
    if (!child || !parent || child.id === parent.id) continue;
    await client.query(
      `INSERT INTO fetch_taxonomy_edges
        (user_id,parent_term_id,child_term_id,relation,confidence)
       VALUES ($1,$2,$3,'narrower',$4)
       ON CONFLICT (user_id,parent_term_id,child_term_id,relation) DO UPDATE
         SET confidence = EXCLUDED.confidence`,
      [userId, parent.id, child.id, Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : null]
    );
  }
}

async function updateRecord(userId, labId, values, { expectedVersion } = {}, db = pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const lab = await ownedLabRow(userId, labId, client, { lock:true });
    if (!lab) { await client.query('ROLLBACK'); return null; }
    if (lab.state !== 'active') throw new Error('fetch_lab_not_active');
    const current = await getRecord(userId, labId, client);
    if (!current || current.locked) throw new Error('fetch_record_locked');
    if (expectedVersion != null && Number(expectedVersion) !== current.version) throw new Error('fetch_record_version_conflict');
    const next = shapeRecord({ ...current, ...values });
    const body = await sealed.sealValue(userId, next, client);
    const { rows } = await client.query(
      `UPDATE fetch_lab_records
          SET version = version + 1,
              content_ciphertext = $3, content_iv = $4, content_tag = $5,
              updated_at = NOW()
        WHERE user_id = $1 AND lab_id = $2 AND NOT locked
        RETURNING id,version,locked,created_at,updated_at`,
      [userId, labId, body.content_ciphertext, body.content_iv, body.content_tag]
    );
    if (Object.prototype.hasOwnProperty.call(values, 'taxonomy')) {
      await replaceTaxonomy(userId, labId, values.taxonomy, client);
    }
    await client.query(`UPDATE fetch_labs SET updated_at = NOW() WHERE user_id = $1 AND id = $2`, [userId, labId]);
    await client.query('COMMIT');
    return { ...rows[0], ...next, version:Number(rows[0].version) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function setCategory(userId, labId, slug, reason = '', db = pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const lab = await ownedLabRow(userId, labId, client, { lock:true });
    if (!lab) { await client.query('ROLLBACK'); return null; }
    if (lab.state !== 'active') throw new Error('fetch_lab_not_active');
    const category = await categoryBySlug(userId, slug, client);
    const reasonBody = reason ? await sealed.sealValue(userId, { reason:clean(reason, 1000) }, client) : null;
    await client.query(
      `UPDATE fetch_labs SET active_category_id = $3,updated_at = NOW()
        WHERE user_id = $1 AND id = $2`,
      [userId, labId, category.id]
    );
    await client.query(
      `INSERT INTO fetch_lab_category_events
        (user_id,lab_id,category_id,reason_ciphertext,reason_iv,reason_tag)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, labId, category.id,
       reasonBody && reasonBody.content_ciphertext,
       reasonBody && reasonBody.content_iv,
       reasonBody && reasonBody.content_tag]
    );
    await client.query('COMMIT');
    return categoryView(category);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function setState(userId, labId, state, db = pool) {
  if (!['active', 'archived'].includes(state)) throw new Error('fetch_lab_state_invalid');
  const { rows } = await db.query(
    `UPDATE fetch_labs
        SET state = $3,
            archived_at = CASE WHEN $3 = 'archived' THEN NOW() ELSE NULL END,
            updated_at = NOW()
      WHERE user_id = $1 AND id = $2 AND state <> 'deleted'
      RETURNING id`,
    [userId, labId, state]
  );
  return Boolean(rows[0]);
}

async function deleteWorkspace(userId, labId, db = pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const lab = await ownedLabRow(userId, labId, client, { lock:true });
    if (!lab) { await client.query('ROLLBACK'); return false; }
    if (lab.state === 'deleted') { await client.query('COMMIT'); return true; }
    await client.query(`DELETE FROM fetch_lab_messages WHERE user_id = $1 AND lab_id = $2`, [userId, labId]);
    await client.query(`DELETE FROM fetch_lab_raw_sources WHERE user_id = $1 AND lab_id = $2`, [userId, labId]);
    await client.query(`DELETE FROM fetch_lab_category_events WHERE user_id = $1 AND lab_id = $2`, [userId, labId]);
    await client.query(
      `UPDATE fetch_lab_records SET locked = TRUE,updated_at = NOW()
        WHERE user_id = $1 AND lab_id = $2`,
      [userId, labId]
    );
    await client.query(
      `UPDATE fetch_labs
          SET state = 'deleted',deleted_at = NOW(),archived_at = NULL,updated_at = NOW()
        WHERE user_id = $1 AND id = $2`,
      [userId, labId]
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function publishIncognito(userId, labId, db = pool) {
  const { rows } = await db.query(
    `UPDATE fetch_labs SET visibility = 'indexed',published_at = NOW(),updated_at = NOW()
      WHERE user_id = $1 AND id = $2 AND visibility = 'incognito'
      RETURNING id`,
    [userId, labId]
  );
  return Boolean(rows[0]);
}

async function getSettings(userId, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO fetch_settings (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING live_search_mode,autonomy_mode,updated_at`,
    [userId]
  );
  return {
    liveSearchMode:rows[0].live_search_mode,
    autonomyMode:rows[0].autonomy_mode,
    updatedAt:rows[0].updated_at,
  };
}

async function updateSettings(userId, values, db = pool) {
  const current = await getSettings(userId, db);
  const live = LIVE_SEARCH_MODES.has(values.liveSearchMode) ? values.liveSearchMode : current.liveSearchMode;
  const autonomy = AUTONOMY_MODES.has(values.autonomyMode) ? values.autonomyMode : current.autonomyMode;
  const { rows } = await db.query(
    `UPDATE fetch_settings SET live_search_mode = $2,autonomy_mode = $3,updated_at = NOW()
      WHERE user_id = $1 RETURNING live_search_mode,autonomy_mode,updated_at`,
    [userId, live, autonomy]
  );
  return { liveSearchMode:rows[0].live_search_mode, autonomyMode:rows[0].autonomy_mode, updatedAt:rows[0].updated_at };
}

function grantPayload({ labId, query, categoryId, requestId, ceilingStardust }) {
  return JSON.stringify({
    labId:String(labId),
    query:clean(query, 2000),
    categoryId:String(categoryId),
    requestId:String(requestId),
    ceilingStardust:Number(ceilingStardust),
  });
}

async function createSearchGrant(userId, request, db = pool) {
  const settings = await getSettings(userId, db);
  if (settings.liveSearchMode !== 'ask') throw new Error('fetch_search_grant_not_required');
  const lab = await ownedLabRow(userId, request.labId, db);
  if (!lab || lab.state !== 'active') throw new Error('fetch_lab_not_active');
  const requestId = request.requestId || crypto.randomUUID();
  const ceiling = Number(request.ceilingStardust);
  if (!Number.isSafeInteger(ceiling) || ceiling <= 0) throw new Error('fetch_search_ceiling_invalid');
  const payload = grantPayload({ ...request, requestId, categoryId:lab.active_category_id, ceilingStardust:ceiling });
  const fingerprint = await sealed.fingerprint(userId, 'fetch-live-search-grant', payload, db);
  const { rows } = await db.query(
    `INSERT INTO fetch_live_search_grants
      (user_id,lab_id,request_id,request_fingerprint,category_id,ceiling_stardust,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW() + INTERVAL '10 minutes')
     RETURNING id,request_id,expires_at,ceiling_stardust`,
    [userId, request.labId, requestId, fingerprint, lab.active_category_id, ceiling]
  );
  return {
    grantId:rows[0].id,
    requestId:rows[0].request_id,
    expiresAt:rows[0].expires_at,
    ceilingStardust:Number(rows[0].ceiling_stardust),
  };
}

async function consumeSearchPermission(userId, request, db = pool) {
  const settings = await getSettings(userId, db);
  if (settings.liveSearchMode === 'off') throw new Error('fetch_live_search_disabled');
  if (settings.liveSearchMode === 'automatic') return { mode:'automatic' };
  const lab = await ownedLabRow(userId, request.labId, db);
  if (!lab || lab.state !== 'active') throw new Error('fetch_lab_not_active');
  const payload = grantPayload({ ...request, categoryId:lab.active_category_id });
  const fingerprint = await sealed.fingerprint(userId, 'fetch-live-search-grant', payload, db);
  const { rows } = await db.query(
    `UPDATE fetch_live_search_grants
        SET consumed_at = NOW()
      WHERE user_id = $1 AND lab_id = $2 AND request_id = $3
        AND request_fingerprint = $4 AND category_id = $5
        AND ceiling_stardust >= $6 AND consumed_at IS NULL AND expires_at > NOW()
      RETURNING id,ceiling_stardust`,
    [userId, request.labId, request.requestId, fingerprint, lab.active_category_id, Number(request.ceilingStardust)]
  );
  if (!rows[0]) throw new Error('fetch_live_search_approval_required');
  return { mode:'approved', grantId:rows[0].id, ceilingStardust:Number(rows[0].ceiling_stardust) };
}

async function searchIndex(userId, query, options = {}, db = pool) {
  const needle = normalizeTerm(query);
  if (!needle) return [];
  const { rows } = await db.query(
    `SELECT l.*,c.slug AS category_slug,c.system_name AS category_name,
            c.system_description AS category_description,c.capability_keys
       FROM fetch_labs l
       LEFT JOIN fetch_categories c ON c.id = l.active_category_id
      WHERE l.user_id = $1 AND l.visibility = 'indexed'
        AND ($2::text IS NULL OR l.state = $2)
      ORDER BY l.updated_at DESC`,
    [userId, LAB_STATES.has(options.state) ? options.state : null]
  );
  const opened = await openLabs(userId, rows, db);
  const out = [];
  for (const lab of opened) {
    const [record, taxonomy] = await Promise.all([
      getRecord(userId, lab.id, db),
      listTaxonomy(userId, lab.id, db),
    ]);
    const terms = taxonomy.flatMap(term => [term.label, ...(term.aliases || [])]);
    const sourceText = (record && record.evidence || []).map(item =>
      `${item && item.title || ''} ${item && item.url || ''} ${item && item.strength || ''}`
    ).join(' ');
    const recordText = record ? [record.title,record.objective,record.scope,record.summary,
      ...(record.decisions || []),...(record.findings || []).map(item => item && (item.claim || item.title) || ''),
      ...(record.openQuestions || [])].join(' ') : '';
    const taxonomyMatch = terms.some(term => normalizeTerm(term).includes(needle));
    const recordMatch = normalizeTerm(`${lab.title} ${recordText}`).includes(needle);
    const sourceMatch = normalizeTerm(sourceText).includes(needle);
    if (!taxonomyMatch && !recordMatch && !sourceMatch) continue;
    if (options.source && !normalizeTerm(sourceText).includes(normalizeTerm(options.source))) continue;
    out.push({ ...lab, matchedTerms:terms.filter(term => normalizeTerm(term).includes(needle)).slice(0, 8), match:{ taxonomy:taxonomyMatch, record:recordMatch, source:sourceMatch } });
  }
  return out;
}

module.exports = {
  LAB_STATES,
  VISIBILITIES,
  LIVE_SEARCH_MODES,
  AUTONOMY_MODES,
  CATEGORY_SLUGS,
  normalizeTerm,
  shapeRecord,
  categories,
  allocateLabNumber,
  createLab,
  listLabs,
  getLab,
  renameLab,
  getRecord,
  listTaxonomy,
  addMessage,
  addRawSource,
  updateRecord,
  setCategory,
  setState,
  deleteWorkspace,
  publishIncognito,
  getSettings,
  updateSettings,
  createSearchGrant,
  consumeSearchPermission,
  searchIndex,
};
