'use strict';

const express = require('express');

function createPairingManagementRouter({ pairing, mutationGuard, onUnpair = () => {} }) {
  if (!pairing || typeof pairing.status !== 'function' || typeof pairing.rotate !== 'function' || typeof pairing.unpair !== 'function') throw new TypeError('pairing manager required');
  if (typeof mutationGuard !== 'function') throw new TypeError('authenticated mutationGuard required');
  const router = express.Router();
  router.use(express.json({ limit:'4kb' }));
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/', (_req,res)=>res.json(pairing.status()));
  router.post('/rotate', mutationGuard, (_req,res)=>{
    try { return res.json({ rotated:true, ...pairing.rotate() }); }
    catch (_) { return res.status(503).json({ error:'pairing_rotation_failed', reconciliation:pairing.status().reconciliation }); }
  });
  router.post('/unpair', mutationGuard, (_req,res)=>{
    try {
      const result = pairing.unpair();
      onUnpair();
      return res.json({ unpaired:true, ...result });
    } catch (_) { return res.status(503).json({ error:'pairing_unpair_failed', reconciliation:pairing.status().reconciliation }); }
  });
  return router;
}

module.exports = { createPairingManagementRouter };
