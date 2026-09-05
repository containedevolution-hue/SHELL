const pool = require('../db');
const { getPassStatus } = require('./pass');

const FREE_STORAGE_QUOTA_BYTES = 15 * 1024 * 1024;
const PASS_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;

const SOURCE_BYTE_QUERIES = {
  notes:          `SELECT COALESCE(SUM(LENGTH(content) + LENGTH(title))::bigint, 0) AS bytes FROM notes WHERE user_id = $1`,
  scribbles:      `SELECT COALESCE(SUM(LENGTH(content) + LENGTH(title))::bigint, 0) AS bytes FROM scribbles WHERE user_id = $1 AND deleted_at IS NULL`,
  brain_dumps:    `SELECT COALESCE(SUM(LENGTH(COALESCE(content,'')) + LENGTH(COALESCE(title,'')))::bigint, 0) AS bytes FROM brain_dumps WHERE user_id = $1`,
  pa_tasks:       `SELECT COALESCE(SUM(LENGTH(COALESCE(title,'')) + LENGTH(COALESCE(description,'')) + LENGTH(COALESCE(notes,'')))::bigint, 0) AS bytes FROM pa_tasks WHERE user_id = $1`,
  memory_entries: `SELECT COALESCE(SUM(COALESCE(OCTET_LENGTH(content_ciphertext), 0))::bigint, 0) AS bytes FROM memory_entries WHERE user_id = $1`,
  files:          `SELECT COALESCE(SUM(size_bytes)::bigint, 0) AS bytes FROM files WHERE user_id = $1`,
};

function quotaBytesForPass(passActive) {
  return passActive ? PASS_STORAGE_QUOTA_BYTES : FREE_STORAGE_QUOTA_BYTES;
}

async function storageQuotaForUser(userId) {
  const pass = await getPassStatus(userId);
  return quotaBytesForPass(!!pass.active);
}

async function cloudUsageForUser(userId, queryable = pool) {
  const per_source = {};
  let used = 0;
  for (const [source, sql] of Object.entries(SOURCE_BYTE_QUERIES)) {
    try {
      const result = await queryable.query(sql, [userId]);
      const bytes = Number(result.rows[0]?.bytes || 0);
      per_source[source] = bytes;
      used += bytes;
    } catch (error) {
      
      if (error && error.code === '42P01') per_source[source] = 0;
      else throw error;
    }
  }
  return {
    used,
    quota: await storageQuotaForUser(userId),
    per_source,
  };
}

module.exports = {
  FREE_STORAGE_QUOTA_BYTES,
  PASS_STORAGE_QUOTA_BYTES,
  SOURCE_BYTE_QUERIES,
  quotaBytesForPass,
  storageQuotaForUser,
  cloudUsageForUser,
};
