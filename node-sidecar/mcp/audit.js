'use strict';

const fs = require('fs');
const { inData } = require('../lib/paths');

function record(event) {
  try {
    fs.appendFileSync(inData('mcp-audit.log'), JSON.stringify({ t: new Date().toISOString(), ...event }) + '\n');
  } catch (_) {  }
}

module.exports = { record };
