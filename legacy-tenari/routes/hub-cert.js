'use strict';

const express = require('express');
const pool    = require('../db');
const cf      = require('../lib/cloudflare-dns');
const { issueCert, generateSlug, HUB_APEX } = require('../lib/hub-acme');

const router = express.Router();
const RENEW_BEFORE_DAYS = 30;

router.post('/provision', async (req, res) => {
  
  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Bearer token required' });

  const { lan_ip } = req.body || {};
  if (!lan_ip || typeof lan_ip !== 'string') {
    return res.status(400).json({ error: 'lan_ip required' });
  }

  const { rows: empRows } = await pool.query(
    "SELECT id FROM users WHERE preferences->>'hub_pairing_token' = $1",
    [token]
  );
  if (!empRows.length) return res.status(403).json({ error: 'unknown_token' });
  const userId = empRows[0].id;

  const { rows: certRows } = await pool.query(
    'SELECT * FROM hub_certs WHERE user_id = $1',
    [userId]
  );

  let row = certRows[0] || null;
  const needsNewCert = !row || new Date(row.expires_at) < new Date(Date.now() + RENEW_BEFORE_DAYS * 86400_000);
  const ipChanged    = row && row.lan_ip !== lan_ip;

  if (!row) {
    
    const slug      = generateSlug();
    const subdomain = `${slug}.${HUB_APEX}`;

    console.log(`[hub-cert] provisioning ${subdomain} → ${lan_ip} for user ${userId}`);
    const cfRecordId = await cf.upsertARecord(subdomain, lan_ip);
    const { certPem, keyPem, expiresAt } = await issueCert(subdomain);

    await pool.query(
      `INSERT INTO hub_certs
         (user_id, slug, subdomain, lan_ip, cf_record_id, cert_pem, key_pem, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, slug, subdomain, lan_ip, cfRecordId, certPem, keyPem, expiresAt]
    );

    const { rows: fresh } = await pool.query('SELECT * FROM hub_certs WHERE user_id = $1', [userId]);
    row = fresh[0];

  } else {
    
    if (ipChanged) {
      console.log(`[hub-cert] IP update ${row.subdomain}: ${row.lan_ip} → ${lan_ip}`);
      const newCfId = await cf.upsertARecord(row.subdomain, lan_ip);
      await pool.query(
        'UPDATE hub_certs SET lan_ip = $1, cf_record_id = $2 WHERE user_id = $3',
        [lan_ip, newCfId, userId]
      );
      row.lan_ip = lan_ip;
      row.cf_record_id = newCfId;
    }

    if (needsNewCert) {
      console.log(`[hub-cert] renewing cert for ${row.subdomain}`);
      const { certPem, keyPem, expiresAt } = await issueCert(row.subdomain);
      await pool.query(
        'UPDATE hub_certs SET cert_pem=$1, key_pem=$2, expires_at=$3, renewed_at=NOW() WHERE user_id=$4',
        [certPem, keyPem, expiresAt, userId]
      );
      row.cert_pem  = certPem;
      row.key_pem   = keyPem;
      row.expires_at = expiresAt;
    }
  }

  res.json({
    subdomain: row.subdomain,
    cert_pem:  row.cert_pem,
    key_pem:   row.key_pem,
    expires_at: row.expires_at,
  });
});

async function renewAllExpiring() {
  const cutoff = new Date(Date.now() + RENEW_BEFORE_DAYS * 86400_000);
  const { rows } = await pool.query(
    'SELECT * FROM hub_certs WHERE expires_at < $1',
    [cutoff]
  );
  if (!rows.length) {
    console.log('[hub-cert] no certs due for renewal');
    return;
  }
  console.log(`[hub-cert] renewing ${rows.length} cert(s)`);
  for (const row of rows) {
    try {
      const { certPem, keyPem, expiresAt } = await issueCert(row.subdomain);
      await pool.query(
        'UPDATE hub_certs SET cert_pem=$1, key_pem=$2, expires_at=$3, renewed_at=NOW() WHERE id=$4',
        [certPem, keyPem, expiresAt, row.id]
      );
      console.log(`[hub-cert] renewed ${row.subdomain} → expires ${expiresAt.toISOString()}`);
    } catch (err) {
      console.error(`[hub-cert] renewal failed for ${row.subdomain}:`, err.message);
    }
  }
}

module.exports = { router, renewAllExpiring };
