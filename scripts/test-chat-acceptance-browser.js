'use strict';
const assert = require('node:assert/strict');
const express = require('../node-sidecar/node_modules/express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { createChatAcceptanceAssets, installChatAcceptance, PROFILE } = require('../node-sidecar/lib/chat-acceptance-install');

(async()=>{
  const artifact=process.argv[2];
  if(!artifact) throw new Error('Exact private Chat acceptance artifact path is required.');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'shell-chat-browser-')); let browser,server;
  try {
    installChatAcceptance(fs.readFileSync(artifact),root);
    const app=express(); app.use('/__shell/chat-acceptance',createChatAcceptanceAssets(root).router);
    server=app.listen(0,'127.0.0.1'); await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
    const origin=`http://127.0.0.1:${server.address().port}`;
    const options=process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:
      process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{};
    browser=await chromium.launch({headless:true,...options});
    const page=await browser.newPage(); const external=[];
    await page.route('**/*',route=>{const url=new URL(route.request().url()); if(url.origin!==origin){external.push(url.href);return route.abort();}return route.continue();});
    const response=await page.goto(`${origin}/__shell/chat-acceptance/web/index.html`,{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200); assert.equal(new URL(page.url()).pathname,'/__shell/chat-acceptance/web/index.html');
    assert.ok((await page.locator('body').innerText()).trim().length>0); assert.deepEqual(external,[]);
    assert.equal(createChatAcceptanceAssets(root).identity().sha256,PROFILE.sha256);
    console.log('Chat acceptance browser proof passed');
  } finally { if(browser)await browser.close(); if(server)await new Promise(resolve=>server.close(resolve)); fs.rmSync(root,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
