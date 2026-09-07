'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { dataDir } = require('../node-sidecar/lib/paths');
const { installChatAcceptance } = require('../node-sidecar/lib/chat-acceptance-install');
const [file, destination] = process.argv.slice(2);
if (!file) {
  console.error('Usage: node scripts/install-chat-acceptance.js EXACT_PRIVATE_CHAT_RELEASE [ACCEPTANCE_DIRECTORY]');
  process.exitCode = 1;
} else {
  try {
    const target = destination || path.join(dataDir(), 'chat-acceptance');
    console.log(JSON.stringify(installChatAcceptance(fs.readFileSync(file), target)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
