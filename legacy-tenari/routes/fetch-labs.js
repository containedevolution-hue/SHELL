const express = require('express');
const labs = require('../lib/fetch-labs');
const research = require('../lib/fetch-lab-research');

const router = express.Router();

function fail(res, error) {
  const message = String(error && error.message || error || 'fetch_lab_failed');
  if (/not_active|locked/.test(message)) return res.status(409).json({ error:message });
  if (/version_conflict/.test(message)) return res.status(409).json({ error:message });
  if (/approval_required/.test(message)) return res.status(403).json({ error:message });
  if (/disabled/.test(message)) return res.status(403).json({ error:message });
  if (/invalid|required|unavailable|not_required/.test(message)) return res.status(400).json({ error:message });
  console.error('[fetch-labs]', message);
  return res.status(500).json({ error:'fetch_lab_failed' });
}

router.get('/categories', async (req, res) => {
  try { res.json({ categories:await labs.categories(req.userId) }); }
  catch (error) { fail(res, error); }
});

router.get('/labs', async (req, res) => {
  try {
    res.json({ labs:await labs.listLabs(req.userId, {
      state:req.query.state,
      includeDeleted:req.query.include_deleted === '1',
    }) });
  } catch (error) { fail(res, error); }
});

router.post('/labs', async (req, res) => {
  try { res.status(201).json({ lab:await labs.createLab(req.userId, req.body || {}) }); }
  catch (error) { fail(res, error); }
});

router.get('/labs/:labId', async (req, res) => {
  try {
    const lab = await labs.getLab(req.userId, req.params.labId);
    if (!lab) return res.status(404).json({ error:'not_found' });
    res.json({ lab });
  } catch (error) { fail(res, error); }
});

router.patch('/labs/:labId', async (req, res) => {
  try {
    const lab = await labs.renameLab(req.userId, req.params.labId, req.body || {});
    if (!lab) return res.status(404).json({ error:'not_found' });
    res.json({ lab });
  } catch (error) { fail(res, error); }
});

router.post('/labs/:labId/messages', async (req, res) => {
  try {
    const message = await labs.addMessage(req.userId, req.params.labId, 'user', (req.body || {}).text);
    if (!message) return res.status(404).json({ error:'not_found' });
    res.status(201).json({ message });
  } catch (error) { fail(res, error); }
});

router.post('/labs/:labId/turn', async (req, res) => {
  try {
    const result = await research.runLabTurn(req.userId, req.params.labId, req.body || {});
    if (!result) return res.status(404).json({ error:'not_found' });
    res.json(result);
  } catch (error) { fail(res, error); }
});

router.put('/labs/:labId/record', async (req, res) => {
  try {
    const body = req.body || {};
    const record = await labs.updateRecord(req.userId, req.params.labId, body.record || {}, {
      expectedVersion:body.expectedVersion,
    });
    if (!record) return res.status(404).json({ error:'not_found' });
    res.json({ record });
  } catch (error) { fail(res, error); }
});

router.put('/labs/:labId/category', async (req, res) => {
  try {
    const body = req.body || {};
    const category = await labs.setCategory(req.userId, req.params.labId, body.category, body.reason);
    if (!category) return res.status(404).json({ error:'not_found' });
    res.json({ category });
  } catch (error) { fail(res, error); }
});

router.post('/labs/:labId/archive', async (req, res) => {
  try {
    if (!await labs.setState(req.userId, req.params.labId, 'archived')) return res.status(404).json({ error:'not_found' });
    res.json({ state:'archived' });
  } catch (error) { fail(res, error); }
});

router.post('/labs/:labId/reopen', async (req, res) => {
  try {
    if (!await labs.setState(req.userId, req.params.labId, 'active')) return res.status(404).json({ error:'not_found' });
    res.json({ state:'active' });
  } catch (error) { fail(res, error); }
});

router.delete('/labs/:labId/workspace', async (req, res) => {
  try {
    if (!await labs.deleteWorkspace(req.userId, req.params.labId)) return res.status(404).json({ error:'not_found' });
    res.json({ state:'deleted', record:'locked' });
  } catch (error) { fail(res, error); }
});

router.post('/labs/:labId/publish', async (req, res) => {
  try {
    if ((req.body || {}).confirm !== true) return res.status(400).json({ error:'publish_confirmation_required' });
    if (!await labs.publishIncognito(req.userId, req.params.labId)) return res.status(404).json({ error:'not_found' });
    res.json({ visibility:'indexed' });
  } catch (error) { fail(res, error); }
});

router.get('/index', async (req, res) => {
  try { res.json({ labs:await labs.searchIndex(req.userId, req.query.q, { state:req.query.state, source:req.query.source }) }); }
  catch (error) { fail(res, error); }
});

router.get('/lab-settings', async (req, res) => {
  try { res.json(await labs.getSettings(req.userId)); }
  catch (error) { fail(res, error); }
});

router.put('/lab-settings', async (req, res) => {
  try { res.json(await labs.updateSettings(req.userId, req.body || {})); }
  catch (error) { fail(res, error); }
});

router.post('/labs/:labId/live-search-grants', async (req, res) => {
  try {
    res.status(201).json(await labs.createSearchGrant(req.userId, {
      ...(req.body || {}), labId:req.params.labId,
    }));
  } catch (error) { fail(res, error); }
});

module.exports = router;
