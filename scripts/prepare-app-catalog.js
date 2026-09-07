'use strict';
const path = require('node:path');
const { syncCatalog } = require('../node-sidecar/lib/app-catalog-source');
syncCatalog(path.resolve(__dirname,'../node-sidecar/catalog')).then(catalog => {
  console.log(`Prepared ${catalog.apps.length} verified packages from the canonical Apps store.`);
}).catch(error => { console.error(error.message); process.exitCode=1; });
