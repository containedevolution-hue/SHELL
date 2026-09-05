'use strict';

const pool = require('../db');
const fetchCrypto = require('./fetch-crypto');

const CARETAKER_ID = 'fetch';
const SCOPES = Object.freeze(['records', 'findings', 'sources', 'taxonomy']);
const DEFAULT_SCOPES = Object.freeze(['records', 'findings', 'taxonomy']);
const STOP_WORDS = new Set(['about','after','again','could','from','have','into','should','that','their','there','these','they','this','what','when','where','which','with','would','your']);

function normalizeScopes(scopes) {
  const source = Array.isArray(scopes) && scopes.length ? scopes : DEFAULT_SCOPES;
  const allowed = new Set(SCOPES);
  return [...new Set(source.map(value => String(value || '').trim().toLowerCase()).filter(value => allowed.has(value)))];
}

function questionTerms(question) {
  return [...new Set(String(question || '').toLowerCase().match(/[a-z0-9]+/g) || [])]
    .filter(term => term.length > 2 && !STOP_WORDS.has(term)).slice(0, 12);
}

function relevance(text, terms) {
  if (!terms.length) return 1;
  const haystack = String(text || '').toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function clean(value, limit) {
  return String(value == null ? '' : value).trim().slice(0, limit);
}

function labLabel(number) {
  return `Lab ${String(number).padStart(3, '0')}`;
}

async function loadScopedResearchInfo(userId, options = {}, db = pool) {
  if (!userId) return { error:'no_user_context', caretaker_id:CARETAKER_ID };
  const scopes = normalizeScopes(options.scopes);
  if (!scopes.length) return { error:'no_valid_scopes', caretaker_id:CARETAKER_ID };
  const question = clean(options.question, 500);
  const terms = questionTerms(question);
  const query = typeof db === 'function' ? db : db.query.bind(db);
  let rows;
  try {
    rows = (await query(
      `SELECT l.id AS lab_id,l.lab_number,l.state,l.updated_at,
              l.content_ciphertext AS lab_ciphertext,l.content_iv AS lab_iv,l.content_tag AS lab_tag,
              r.id AS record_id,r.version,r.content_ciphertext,r.content_iv,r.content_tag
         FROM fetch_labs l
         JOIN fetch_lab_records r ON r.user_id=l.user_id AND r.lab_id=l.id
        WHERE l.user_id=$1 AND l.visibility='indexed'
        ORDER BY l.updated_at DESC
        LIMIT 100`,
      [userId]
    )).rows || [];
  } catch (_error) {
    return { caretaker_id:CARETAKER_ID,question,scopes,records:[],findings:[],sources:[],taxonomy:[],unavailable:['standardized_records'] };
  }

  const records = [];
  const findings = [];
  const sources = [];
  const taxonomy = [];
  for (const row of rows) {
    const labBody = await fetchCrypto.openValue(userId, { content_ciphertext:row.lab_ciphertext,content_iv:row.lab_iv,content_tag:row.lab_tag }, db);
    const record = await fetchCrypto.openValue(userId, row, db);
    const title = clean(record.title || labBody.title || labLabel(row.lab_number), 160);
    const base = { lab_id:row.lab_id,lab_number:Number(row.lab_number),lab_label:labLabel(row.lab_number),state:row.state,record_id:row.record_id,record_version:Number(row.version),title,updated_at:row.updated_at || null };
    const recordText = [title,record.objective,record.scope,record.summary,...(Array.isArray(record.decisions) ? record.decisions : []),...(Array.isArray(record.findings) ? record.findings.map(item => item && (item.claim || item.title || item)) : []),...(Array.isArray(record.openQuestions) ? record.openQuestions : [])].join(' ');
    const score = relevance(recordText, terms);
    if (!score) continue;
    if (scopes.includes('records')) records.push({ ...base,objective:clean(record.objective, 1200),scope:clean(record.scope, 1800),summary:clean(record.summary, 2400),decisions:Array.isArray(record.decisions) ? record.decisions.slice(0, 30) : [],open_questions:Array.isArray(record.openQuestions) ? record.openQuestions.slice(0, 30) : [],_score:score });
    if (scopes.includes('findings')) for (const finding of (Array.isArray(record.findings) ? record.findings : [])) findings.push({ ...base,...finding,claim:clean(finding && (finding.claim || finding.title || finding), 2400),_score:score });
    if (scopes.includes('sources')) for (const source of (Array.isArray(record.evidence) ? record.evidence : [])) sources.push({ ...base,source_id:source && source.id || null,title:clean(source && source.title, 500),url:clean(source && source.url, 2000) || null,strength:clean(source && source.strength, 80) || null,assessment:clean(source && source.assessment, 1800),_score:score });
  }

  if (scopes.includes('taxonomy')) {
    try {
      const taxonomyRows = (await query(
        `SELECT DISTINCT t.id,t.content_ciphertext,t.content_iv,t.content_tag
           FROM fetch_taxonomy_terms t
           JOIN fetch_lab_taxonomy lt ON lt.user_id=t.user_id AND lt.term_id=t.id
           JOIN fetch_labs l ON l.user_id=lt.user_id AND l.id=lt.lab_id
          WHERE t.user_id=$1 AND l.visibility='indexed'
          LIMIT 250`, [userId]
      )).rows || [];
      for (const row of taxonomyRows) {
        const body = await fetchCrypto.openValue(userId, row, db);
        const label = clean(body.label, 160);
        const aliases = Array.isArray(body.aliases) ? body.aliases.slice(0, 32) : [];
        if (relevance(`${label} ${aliases.join(' ')}`, terms)) taxonomy.push({ term_id:row.id,label,aliases });
      }
    } catch (_error) {}
  }

  const rank = list => list.sort((a, b) => (b._score - a._score) || String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).slice(0, 20).map(({ _score, ...item }) => item);
  return { caretaker_id:CARETAKER_ID,question,scopes,records:rank(records),findings:rank(findings),sources:rank(sources),taxonomy:taxonomy.slice(0, 40),unavailable:[] };
}

function buildLibrarianBrief(info) {
  if (!info || info.error) return '';
  const lines = ['Indexed Fetch Lab records. Preserve every evidence status, date, and caveat. Never upgrade disputed or unsupported material into fact.'];
  if (info.records && info.records.length) {
    lines.push('STANDARDIZED LAB RECORDS:');
    info.records.forEach(item => lines.push(`- ${item.lab_label} — ${item.title}: ${item.summary || item.objective || ''}`));
  }
  if (info.findings && info.findings.length) {
    lines.push('FINDINGS:');
    info.findings.forEach(item => lines.push(`- ${item.lab_label} — ${item.status || 'unassessed'}: ${item.claim}`));
  }
  if (info.sources && info.sources.length) {
    lines.push('SOURCE METADATA:');
    info.sources.forEach(item => lines.push(`- ${item.lab_label} — ${item.strength || 'source'} ${item.url || ''}: ${item.assessment || item.title}`));
  }
  if (info.taxonomy && info.taxonomy.length) lines.push(`TAXONOMY: ${info.taxonomy.map(item => item.label).filter(Boolean).join(', ')}`);
  return lines.join('\n').slice(0, 9000);
}

module.exports = { CARETAKER_ID,SCOPES,normalizeScopes,loadScopedResearchInfo,buildLibrarianBrief };
