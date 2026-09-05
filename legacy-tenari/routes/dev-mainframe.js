const express = require('express');
const pool = require('../db');
const { requireAuth, requireAdmin, touchSession } = require('../middleware/auth');
const bootStack = require('../lib/pa-boot-stack');
const chatDevFailure = require('../lib/chat-dev-failure');
const testCatalog = require('../lib/test-catalog');
const testResultLog = require('../lib/test-result-log');
const testSimilarity = require('../lib/test-similarity');

const router = express.Router();

function testIngestAuthorized(req) {
  const expected = process.env.TEST_RESULTS_INGEST_TOKEN;
  const supplied = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return Boolean(expected && supplied && supplied.length === expected.length &&
    require('node:crypto').timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)));
}

router.post('/test-runs/ingest', async (req, res) => {
  if (!testIngestAuthorized(req)) return res.status(404).json({ error:'Not found' });
  try {
    await testResultLog.recordRun(pool, req.body);
    res.status(201).json({ recorded:true, run_id:req.body.id });
  } catch (error) {
    console.error('[dev-mainframe] test result ingest:', error.message);
    res.status(400).json({ error:'Invalid test run' });
  }
});

router.get('/tests', requireAuth, requireAdmin, touchSession, async (req, res) => {
  try {
    const discovered = testCatalog.discoverTests();
    if (discovered.length) {
      await pool.query(
        `INSERT INTO test_cases (test_id, file_path, name, family, owner, layer, proof_strength, lifecycle, retired_at)
         SELECT discovered.*, 'active', NULL::timestamptz
           FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[]) AS discovered
         ON CONFLICT (test_id) DO UPDATE SET
           file_path=EXCLUDED.file_path, name=EXCLUDED.name,
           family=CASE WHEN test_cases.classification_locked THEN test_cases.family ELSE EXCLUDED.family END,
           owner=CASE WHEN test_cases.classification_locked THEN test_cases.owner ELSE EXCLUDED.owner END,
           layer=CASE WHEN test_cases.classification_locked THEN test_cases.layer ELSE EXCLUDED.layer END,
           proof_strength=CASE WHEN test_cases.classification_locked THEN test_cases.proof_strength ELSE EXCLUDED.proof_strength END,
           lifecycle='active', retired_at=NULL, updated_at=NOW()`,
        [
          discovered.map(row => row.test_id), discovered.map(row => row.file_path),
          discovered.map(row => row.name), discovered.map(row => row.family),
          discovered.map(row => row.owner), discovered.map(row => row.layer),
          discovered.map(row => row.proof_strength),
        ]
      );
    }
    const stored = await pool.query(
      `SELECT c.*,
              latest.status AS latest_status, latest.duration_ms, latest.assertion_summary,
              latest_run.finished_at AS last_run_at,
              COALESCE(f.occurrence_count, 0)::int AS failure_occurrences,
              f.first_seen_at, f.last_seen_at,
              COALESCE(review.review_count, 0)::int AS review_count,
              review.last_reviewed_at,
              COALESCE(rel.relationships, '[]'::jsonb) AS relationships
         FROM test_cases c
         LEFT JOIN LATERAL (
           SELECT r.* FROM test_results r WHERE r.test_id=c.test_id ORDER BY r.id DESC LIMIT 1
         ) latest ON TRUE
         LEFT JOIN test_runs latest_run ON latest_run.id=latest.run_id
         LEFT JOIN LATERAL (
           SELECT SUM(g.occurrence_count)::int AS occurrence_count,
                  MIN(g.first_seen_at) AS first_seen_at, MAX(g.last_seen_at) AS last_seen_at
             FROM test_failure_groups g WHERE g.test_id=c.test_id
         ) f ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS review_count, MAX(reviewed_at) AS last_reviewed_at
             FROM test_case_reviews h WHERE h.test_id=c.test_id
         ) review ON TRUE
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object(
             'test_id', CASE WHEN r.test_id_low=c.test_id THEN r.test_id_high ELSE r.test_id_low END,
             'name', other.name, 'relationship', r.relationship,
             'similarity_score', r.similarity_score, 'explanation', r.explanation
           ) ORDER BY r.similarity_score DESC) AS relationships
             FROM test_relationships r
             JOIN test_cases other ON other.test_id=CASE WHEN r.test_id_low=c.test_id THEN r.test_id_high ELSE r.test_id_low END
            WHERE r.test_id_low=c.test_id OR r.test_id_high=c.test_id
         ) rel ON TRUE`
    );
    const byId = new Map(stored.rows.map(row => [row.test_id, row]));
    const tests = discovered.map(row => ({
      ...row,
      disposition:'unreviewed', risk:'normal', diagnosis:null, latest_status:'unproved',
      failure_occurrences:0, lifecycle:'active', review_count:0,
      ...(byId.get(row.test_id) || {}),
    }));
    for (const row of stored.rows) if (!tests.some(test => test.test_id === row.test_id)) tests.push({ ...row, missing_from_suite:true });
    res.json({ tests, generated_at:new Date().toISOString() });
  } catch (error) {
    if (error.code === '42P01') {
      const tests = testCatalog.discoverTests().map(row => ({
        ...row, disposition:'unreviewed', risk:'normal', latest_status:'unproved', failure_occurrences:0,
      }));
      return res.json({ tests, storage_ready:false, generated_at:new Date().toISOString() });
    }
    console.error('[dev-mainframe] tests:', error.message);
    res.status(500).json({ error:'Test catalog failed' });
  }
});

router.get('/tests/:testId/reviews', requireAuth, requireAdmin, touchSession, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, reviewer_user_id, reviewed_at, previous_values, new_values, reason
         FROM test_case_reviews WHERE test_id=$1 ORDER BY id DESC LIMIT 100`,
      [req.params.testId]
    );
    res.json({ reviews:rows });
  } catch (error) {
    res.status(500).json({ error:'Review history failed' });
  }
});

router.patch('/tests/:testId', requireAuth, requireAdmin, touchSession, async (req, res) => {
  const allowed = ['disposition','risk','diagnosis','family','owner','layer','proof_strength','retention_policy','retained_reason'];
  const enums = {
    disposition:new Set(['unreviewed','keep','rewrite','obsolete','questionable','live-only']),
    risk:new Set(['low','normal','high','critical']),
    layer:new Set(['unit/integration','browser DOM','source contract','migration','live database']),
    proof_strength:new Set(['deterministic behavior','simulated browser','source-only','migration contract','live database']),
    retention_policy:new Set(['none','regression-guard']),
  };
  for (const [key, choices] of Object.entries(enums)) {
    if (req.body[key] !== undefined && !choices.has(req.body[key])) return res.status(400).json({ error:`Invalid ${key}` });
  }
  for (const key of ['diagnosis','retained_reason']) {
    if (req.body[key] !== undefined && String(req.body[key]).length > 2000) return res.status(400).json({ error:`${key} is too long` });
  }
  for (const key of ['family','owner']) {
    if (req.body[key] !== undefined && (!String(req.body[key]).trim() || String(req.body[key]).length > 120)) {
      return res.status(400).json({ error:`Invalid ${key}` });
    }
  }
  if (req.body.retention_policy === 'regression-guard' && !String(req.body.retained_reason || '').trim()) {
    return res.status(400).json({ error:'A regression guard requires a reason that explains what must not return' });
  }
  const fields = [];
  const values = [];
  for (const key of allowed) {
    if (req.body[key] === undefined) continue;
    values.push(req.body[key] === '' ? null : req.body[key]);
    fields.push(`${key}=$${values.length}`);
  }
  if (!fields.length) return res.status(400).json({ error:'Nothing to update' });
  const classificationChanged = ['family','owner','layer','proof_strength'].some(key => req.body[key] !== undefined);
  if (classificationChanged) fields.push('classification_locked=TRUE');
  values.push(req.params.testId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM test_cases WHERE test_id=$1 FOR UPDATE', [req.params.testId]);
    if (!before.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error:'Run the test once before reviewing it' });
    }
    const { rows } = await client.query(
      `UPDATE test_cases SET ${fields.join(', ')}, updated_at=NOW()
        WHERE test_id=$${values.length} RETURNING *`, values);
    const previousValues = Object.fromEntries(allowed.map(key => [key, before.rows[0][key]]));
    const newValues = Object.fromEntries(allowed.map(key => [key, rows[0][key]]));
    await client.query(
      `INSERT INTO test_case_reviews
        (test_id, reviewer_user_id, previous_values, new_values, reason)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5)`,
      [req.params.testId, req.userId, JSON.stringify(previousValues), JSON.stringify(newValues), rows[0].diagnosis]
    );
    const current = await client.query(
      `SELECT test_id, file_path, name, family, owner, layer, proof_strength, lifecycle
         FROM test_cases WHERE lifecycle='active'`
    );
    await testSimilarity.replaceRelationships(client, current.rows);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(400).json({ error:'Review update rejected' });
  } finally {
    client.release();
  }
});

const KNOWN_CRONS = [
  { id: 'orion-maintenance',     label: 'Memory librarian — nightly cleanup', job_name: 'orion-maintenance',     schedule: '0 2 * * *',     tz: 'UTC',              schedule_human: 'Every night at 2 AM UTC',          touches: 'memory-tree', can_trigger: true,  notes: 'Ages memories (hot to cold) and promotes pending categories.' },
  { id: 'chat-summary-sweeper',  label: 'Chat capture sweeper',               job_name: 'chat-summary-sweeper',  schedule: '*/5 * * * *',   tz: 'UTC',              schedule_human: 'Every 5 minutes',                  touches: 'chat',        can_trigger: true,  notes: 'Captures substantive chat messages into the Pending queue.' },
  { id: 'memory-pending-commit', label: 'Pending observation commit',         job_name: 'memory-pending-commit', schedule: '*/5 * * * *',   tz: 'UTC',              schedule_human: 'Every 5 minutes',                  touches: 'memory-tree', can_trigger: true,  notes: 'Commits queued observations into Memory and routes each accepted fact under a facet via Orion.' },
  { id: 'companion-important-moments', label: 'Companion Important Moments',  job_name: 'companion-important-moments', schedule: '0 4 * * *', tz: 'UTC',              schedule_human: 'Every night at 4 AM UTC',          touches: 'memory-tree', can_trigger: true,  notes: 'Selects a bounded set of relationship-relevant pointers to active canonical Memory facts.' },
  { id: 'hub-cert-renewal',     label: 'SHELL cert renewal',        job_name: null,                   schedule: '0 5 * * *',     tz: 'UTC',              schedule_human: 'Every night at 5 AM UTC',          touches: null,          can_trigger: true,  notes: 'Renews the SHELL TLS certs before they expire.' },
  { id: 'auto-clockout',        label: 'Auto clock-out',                     job_name: null,                   schedule: '55 23 * * *',   tz: 'America/Detroit',  schedule_human: 'Every night at 11:55 PM',          touches: null,          can_trigger: false, notes: 'Closes out forgotten shifts. Run-now disabled — would clock out anyone still on-shift.' },
  { id: 'daily-log',            label: 'Daily log compile',                  job_name: null,                   schedule: '59 23 * * *',   tz: 'America/Detroit',  schedule_human: 'Every night at 11:59 PM',          touches: null,          can_trigger: false, notes: 'Compiles each user\'s daily log. Run-now disabled — would compile a partial day.' },
  { id: 'bot-monthly-reset',    label: 'Monthly bot quota reset',            job_name: null,                   schedule: '1 0 1 * *',     tz: 'America/Detroit',  schedule_human: 'First of the month, 12:01 AM',     touches: null,          can_trigger: false, notes: 'Resets every user\'s monthly bot token quota. Run-now disabled — would zero everyone mid-month.' }
];

const TRIGGER_RUNNERS = {
  'orion-maintenance':     () => require('../cron/orion').runOrionMaintenance(),
  'chat-summary-sweeper':  () => require('../cron/chat-summary-sweeper').runChatSummarySweeper(),
  'memory-pending-commit': () => require('../cron/memory-pending-commit').runMemoryPendingCommit(),
  'companion-important-moments': () => require('../cron/companion-important-moments').runCompanionImportantMoments(),
  'hub-cert-renewal':     () => require('../routes/hub-cert').renewAllExpiring()
};

const KNOWN_BOTS = KNOWN_CRONS
  .filter(c => c.job_name)
  .map(c => ({
    id: c.id,
    job_name: c.job_name,
    label: c.label,
    touches: c.touches,
    schedule_human: c.schedule_human,
    can_trigger: c.can_trigger && typeof TRIGGER_RUNNERS[c.id] === 'function'
  }));

router.get('/cron-status', requireAuth, requireAdmin, touchSession, async (req, res) => {
  try {
    const jobNames = KNOWN_BOTS.map(b => b.job_name);

    const running = await pool.query(
      `SELECT id, job_name, started_at, status, details
         FROM cron_runs
        WHERE finished_at IS NULL
          AND job_name = ANY($1::text[])
        ORDER BY started_at DESC`,
      [jobNames]
    );

    const recent = await pool.query(
      `SELECT DISTINCT ON (job_name)
              job_name, id, started_at, finished_at, status, error_message, details
         FROM cron_runs
        WHERE finished_at IS NOT NULL
          AND job_name = ANY($1::text[])
        ORDER BY job_name, finished_at DESC`,
      [jobNames]
    );

    res.json({
      bots: KNOWN_BOTS,
      running: running.rows,
      recent: recent.rows,
      now: new Date().toISOString()
    });
  } catch (err) {
    console.error('[dev-mainframe] cron-status failed:', err.message);
    res.status(500).json({ error: 'cron-status failed' });
  }
});

router.get('/boot-folder', requireAuth, requireAdmin, touchSession, async (req, res) => {
  try {
    const userId = req.userId;
    let bootUser = null;
    try {
      const r = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
      const row = r.rows[0] || {};
      bootUser = {
        user_first_name: (String(row.name || '').trim().split(/\s+/)[0] || null),
      };
    } catch (_) {  }

    res.json({
      identity: {
        GUIDE_RUNTIME: bootStack.GUIDE_RUNTIME,
        GUIDE_BASE: bootStack.GUIDE_BASE,
      },
      tool_framing: {
        PA_CAPABILITY: bootStack.PA_CAPABILITY,
        PA_WEB: bootStack.PA_WEB,
        PA_RECALL: bootStack.PA_RECALL,
        INCOGNITO_DELTA: bootStack.INCOGNITO_DELTA,
        CONTEXT_OFF_DELTA: bootStack.CONTEXT_OFF_DELTA,
        OP_SEP: bootStack.OP_SEP
      },
      teachings: {
        TEACHINGS_PREAMBLE: bootStack.TEACHINGS_PREAMBLE,
        TEACHINGS_BUDGET: bootStack.TEACHINGS_BUDGET
      },
      compliance: {
        legal: bootStack.COMPLIANCE_FIRST_TURN.legal,
        wellness: bootStack.COMPLIANCE_FIRST_TURN.wellness
      },
      modes: {
        pa_persisted:        bootStack.buildOperatingPreamble({}),
        pa_incognito:        bootStack.buildOperatingPreamble({ incognito: true }),
        pa_context_off:      bootStack.buildOperatingPreamble({ context_off: true }),
        inspire_task:        bootStack.TASK_PREAMBLE,
        legal_first_turn:    bootStack.COMPLIANCE_FIRST_TURN.legal,
        wellness_first_turn: bootStack.COMPLIANCE_FIRST_TURN.wellness
      },
      boot_user: bootUser,
      config_version: bootStack.PA_CONFIG_VERSION,
      truth_source: 'lib/pa-boot-stack.js'
    });
  } catch (err) {
    console.error('[dev-mainframe] boot-folder failed:', err.message);
    res.status(500).json({ error: 'boot-folder failed' });
  }
});

router.post('/cron/:id/trigger', requireAuth, requireAdmin, touchSession, (req, res) => {
  const id = req.params.id;
  const meta = KNOWN_CRONS.find(c => c.id === id);
  if (!meta) return res.status(404).json({ error: 'unknown cron' });
  if (!meta.can_trigger) return res.status(400).json({ error: 'manual fire disabled for this cron' });
  const runner = TRIGGER_RUNNERS[id];
  if (typeof runner !== 'function') return res.status(500).json({ error: 'no runner registered' });
  try {
    Promise.resolve(runner()).catch(err => {
      console.error(`[dev-mainframe] manual fire of ${id} failed:`, err && err.message);
    });
    res.json({ triggered: true, id, at: new Date().toISOString() });
  } catch (err) {
    console.error('[dev-mainframe] trigger setup failed:', err.message);
    res.status(500).json({ error: 'trigger failed' });
  }
});

router.post('/chat-failure', requireAuth, requireAdmin, touchSession, async (req, res) => {
  const sessionId = Number.parseInt(req.body?.session_id, 10);
  const path = String(req.body?.path || 'funded');
  if (!Number.isFinite(sessionId)) return res.status(400).json({ error: 'session_id must be an integer' });
  if (path !== 'funded' && path !== 'byok') return res.status(400).json({ error: 'path must be funded or byok' });
  if (!chatDevFailure.enabled(req.hostname)) return res.status(404).json({ error: 'Not found' });
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    chatDevFailure.arm({ userId: req.userId, sessionId, path, hostname: req.hostname });
    res.json({ armed: true, session_id: sessionId, path });
  } catch (error) {
    console.error('[dev-mainframe] chat failure seam:', error.message);
    res.status(500).json({ error: 'Could not arm Chat failure' });
  }
});

module.exports = router;
