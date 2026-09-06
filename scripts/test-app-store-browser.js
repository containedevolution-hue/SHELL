'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const express = createRequire(path.resolve(__dirname,'../node-sidecar/package.json'))('express');
const { chromium } = require('playwright');
const { createAppStore } = require('../node-sidecar/lib/app-store');
const { createRegistry } = require('../node-sidecar/lib/app-registry');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'shell-click-install-'));
  let browser, server;
  try {
    const app = express();
    app.use('/v1/app-store',createAppStore({catalogDirectory:path.resolve(__dirname,'../node-sidecar/catalog'),appsDirectory:root}));
    app.use('/v1/apps',createRegistry(root).router());
    app.use(express.static(path.resolve(__dirname,'../web')));
    server = app.listen(5984,'127.0.0.1');
    await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
    browser = await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
    const page = await browser.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:5984');
    await page.getByText(/No apps installed yet/).waitFor();
    await page.getByRole('tab',{name:'Contained Evolution Apps'}).click();
    await page.getByRole('button',{name:'Install Scribble',exact:true}).click();
    await page.getByRole('button',{name:'Open Scribble',exact:true}).waitFor();
    await page.reload();
    await page.getByRole('button',{name:'Open Scribble',exact:true}).click();
    await page.getByRole('button',{name:'Create a document',exact:true}).click();
    await page.getByRole('textbox',{name:'Document title',exact:true}).fill('Installed from Shell');
    await page.getByRole('textbox',{name:'Document content',exact:true}).fill('The installed app works.');
    await page.getByText('Saved in this browser',{exact:true}).waitFor();
    assert.equal((await page.locator('#content').innerText()),'The installed app works.');
    assert.deepEqual(errors,[]);
    console.log('Passed empty SHELL → catalog → Install Scribble → reload → Open → create and save.');
  } finally {
    if(browser) await browser.close();
    if(server?.listening) await new Promise(resolve=>server.close(resolve));
    fs.rmSync(root,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
