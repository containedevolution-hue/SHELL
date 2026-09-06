'use strict';
const path = require('node:path');
const { createRequire } = require('node:module');
const express = createRequire(path.resolve(__dirname, '../node-sidecar/package.json'))('express');
const { createAppStore } = require('../node-sidecar/lib/app-store');
const { createRegistry } = require('../node-sidecar/lib/app-registry');

function createAppHost(appsDirectory) {
  const app = express();
  app.use('/v1/app-store', createAppStore({
    catalogDirectory: path.resolve(__dirname, '../node-sidecar/catalog'),
    appsDirectory,
  }));
  app.use('/v1/apps', createRegistry(appsDirectory).router());
  app.use(express.static(path.resolve(__dirname, '../web')));
  return app;
}

if (require.main === module) {
  const appsDirectory = path.resolve(process.env.SHELL_APPS_DIR || path.join(__dirname, '../node-sidecar/data/apps'));
  const server = createAppHost(appsDirectory).listen(5984, '127.0.0.1', () => {
    console.log('SHELL browser app host: http://127.0.0.1:5984');
    console.log(`Installed packages: ${appsDirectory}`);
    console.log('Documents stay in this browser profile. Use app export for portable backups.');
    console.log('Keep this terminal open. Press Ctrl+C to stop.');
  });
  server.on('error', error => {
    console.error(`Could not start the app host: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createAppHost };
