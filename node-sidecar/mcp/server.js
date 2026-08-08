'use strict';

const express = require('express');
const { listTools, executeTool } = require('./registry');

const PROTOCOL_VERSION = '2025-11-25';
const SERVER_INFO = { name: 'ce-hub-appliance', version: '0.1.0' };

function originAllowed(origin) {
  if (!origin) return true;
  let host;
  try { host = new URL(origin).hostname; } catch (_) { return false; }
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host === '[::1]'
    || host.endsWith('.localhost');
}

function jsonrpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: '2.0', id: id ?? null, error: err };
}

function jsonrpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

async function dispatch(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return jsonrpcError(message?.id, -32600, 'Invalid Request');
  }
  const { id, method, params } = message;
  switch (method) {
    case 'initialize':
      return jsonrpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case 'ping':
      return jsonrpcResult(id, {});
    case 'tools/list':
      return jsonrpcResult(id, { tools: listTools() });
    case 'tools/call': {
      const name = params?.name;
      if (typeof name !== 'string') {
        return jsonrpcError(id, -32602, 'Invalid params: name required');
      }
      const result = await executeTool(name, params?.arguments);
      const isError = !!(result && typeof result === 'object' && 'error' in result);
      return jsonrpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError,
      });
    }
    case 'notifications/initialized':
      
      return null;
    default:
      return jsonrpcError(id, -32601, `Method not found: ${method}`);
  }
}

function mount() {
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  router.post('/', async (req, res) => {
    if (!originAllowed(req.headers.origin)) {
      return res.status(403).json(jsonrpcError(null, -32000, 'Origin not allowed'));
    }
    try {
      const body = req.body;
      if (Array.isArray(body)) {
        const responses = (await Promise.all(body.map(dispatch))).filter((r) => r !== null);
        return responses.length === 0 ? res.status(204).end() : res.json(responses);
      }
      const response = await dispatch(body);
      if (response === null) return res.status(204).end();
      return res.json(response);
    } catch (err) {
      return res.status(500).json(jsonrpcError(null, -32603, `Internal error: ${err.message}`));
    }
  });

  return router;
}

module.exports = { mount };
