'use strict';

const pool = require('../db');
const { encryptWithKey, decryptWithKey, digestWithKey } = require('./user-crypto');
const { getUserDek } = require('./user-keys');

function sealed(row) {
  return Boolean(row && row.content_ciphertext && row.content_iv && row.content_tag);
}

function sealWithKey(key, value) {
  const { ciphertext, iv, tag } = encryptWithKey(key, JSON.stringify(value == null ? {} : value));
  return { content_ciphertext: ciphertext, content_iv: iv, content_tag: tag };
}

function openWithKey(key, row) {
  if (!sealed(row)) return {};
  try {
    return JSON.parse(decryptWithKey(key, {
      ciphertext: row.content_ciphertext,
      iv: row.content_iv,
      tag: row.content_tag,
    }) || '{}') || {};
  } catch (_err) {
    return {};
  }
}

function strip(row) {
  if (!row) return row;
  const { content_ciphertext, content_iv, content_tag, ...rest } = row;
  return rest;
}

async function sealValue(userId, value, db = pool) {
  return sealWithKey(await getUserDek(userId, db), value);
}

async function openValue(userId, row, db = pool) {
  if (!row) return null;
  if (!sealed(row)) return {};
  return openWithKey(await getUserDek(userId, db), row);
}

async function fingerprint(userId, namespace, value, db = pool) {
  const digest = digestWithKey(await getUserDek(userId, db), namespace, value);
  return digest.toString('hex');
}

module.exports = {
  sealed,
  strip,
  sealWithKey,
  openWithKey,
  sealValue,
  openValue,
  fingerprint,
};
