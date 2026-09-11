'use strict';
// Serve only the standalone design study, without the app host or sidecar.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../web/desktop');
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/layout.css', ['layout.css', 'text/css; charset=utf-8']],
  ['/layout.js', ['layout.js', 'text/javascript; charset=utf-8']],
  ['/files.js', ['files.js', 'text/javascript; charset=utf-8']],
  ['/assets/cee-mesh-desktop-v1.png', ['assets/cee-mesh-desktop-v1.png', 'image/png']],
  ['/assets/cee-core-ember-v1.png', ['assets/cee-core-ember-v1.png', 'image/png']],
]);
const server = http.createServer((request, response) => {
  const file = files.get(request.url);
  if (!file || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404).end(); return; }
  fs.readFile(path.join(root, file[0]), (error, data) => {
    if (error) { response.writeHead(500).end('Preview file unavailable'); return; }
    response.writeHead(200, {'Content-Type':file[1], 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
    response.end(request.method === 'HEAD' ? undefined : data);
  });
});
server.listen(4176, '127.0.0.1', () => console.log('CEE OS desktop: http://127.0.0.1:4176'));
server.on('error', error => { console.error(`Could not start desktop preview: ${error.message}`); process.exitCode = 1; });
