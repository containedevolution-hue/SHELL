'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createAppHost } = require('./start-app-host');
const { chromium } = require('playwright');
const { createRegistry } = require('../node-sidecar/lib/app-registry');
const reviewed = require('../contracts/app-catalog.json');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'shell-click-install-'));
  let browser, server;
  try {
    const app = createAppHost(root);
    server = app.listen(5984,'127.0.0.1');
    await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
    const browserOptions = process.env.BROWSER_EXECUTABLE_PATH
      ? {executablePath:process.env.BROWSER_EXECUTABLE_PATH}
      : process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {};
    browser = await chromium.launch({headless:true,...browserOptions});
    const page = await browser.newPage({acceptDownloads:true});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const externalRequests=[];
    await page.route('**/*',route=>{
      if(new URL(route.request().url()).origin !== 'http://127.0.0.1:5984') {
        externalRequests.push(route.request().url()); return route.abort();
      }
      return route.continue();
    });
    await page.goto('http://127.0.0.1:5984');
    await page.getByText(/No apps installed yet/).waitFor();
    await page.getByRole('tab',{name:'Contained Evolution Apps'}).click();
    for(const item of reviewed.apps) {
      await page.getByRole('button',{name:`Install ${item.name}`,exact:true}).click();
      await page.getByRole('button',{name:`Open ${item.name}`,exact:true}).waitFor();
    }
    const registry=createRegistry(root);
    assert.deepEqual(registry.list().map(app=>app.id).sort(),reviewed.apps.map(app=>app.id).sort());
    await page.reload();
    await page.getByRole('button',{name:'Open Scribble',exact:true}).click();
    await page.getByRole('button',{name:'Create a document',exact:true}).click();
    await page.getByRole('textbox',{name:'Document title',exact:true}).fill('Installed from Shell');
    await page.getByRole('textbox',{name:'Document content',exact:true}).fill('The installed app works.');
    await page.getByText('Saved in this browser',{exact:true}).waitFor();
    assert.equal((await page.locator('#content').innerText()),'The installed app works.');

    async function open(name) {
      await page.goto('http://127.0.0.1:5984');
      await page.getByRole('button',{name:`Open ${name}`,exact:true}).click();
    }
    async function transfer(button) {
      const event=page.waitForEvent('download'); await page.locator(button).click();
      const download=await event;
      const bytes=fs.readFileSync(await download.path());
      await page.locator('#import-file').setInputFiles({name:download.suggestedFilename(),mimeType:'application/json',buffer:bytes});
      await page.locator('#status').filter({hasText:'Imported as a new'}).waitFor();
      return JSON.parse(bytes);
    }
    await open('Notes');
    await page.locator('#type').selectOption('checklist');
    await page.locator('#new').click();
    await page.locator('#title').fill('SHELL packing list');
    await page.locator('#content').fill('Stored by the installed Notes app.');
    await page.locator('#item-text').fill('Notebook');
    await page.locator('#add-item button').click();
    await page.locator('#items input').check();
    await open('Canvas');
    await page.locator('#new').click();
    await page.locator('#title').fill('SHELL planning surface');
    await page.locator('#tool').selectOption('note');
    await page.locator('#element-text').fill('A local idea');
    const surface=await page.locator('#surface').boundingBox();
    await page.mouse.click(surface.x+80,surface.y+80);
    await page.locator('#frame').click();
    await open('Scribble');
    await page.getByRole('button',{name:/Installed from Shell/}).click();
    assert.equal(await page.locator('#content').innerText(),'The installed app works.');
    await open('Notes');
    await page.getByRole('button',{name:/SHELL packing list/}).click();
    assert.equal(await page.locator('#content').inputValue(),'Stored by the installed Notes app.');
    assert.equal(await page.locator('#items input').isChecked(),true);
    const note=await transfer('#export');
    assert.equal(note.kind,'notes.document');
    assert.equal(note.document.items[0].done,true);
    assert.equal(await page.locator('#list').getByRole('button',{name:/SHELL packing list/}).count(),2);
    assert.equal(await page.locator('#items input').isChecked(),true);
    await open('Canvas');
    await page.getByRole('button',{name:'SHELL planning surface',exact:true}).click();
    assert.equal(await page.locator('#world > g').count(),1);
    const canvas=await transfer('#export');
    assert.equal(canvas.kind,'canvas.document');
    assert.equal(canvas.document.elements[0].text,'A local idea');
    assert.equal(canvas.document.frames.length,1);
    await page.locator('#world > g').waitFor();
    assert.equal(await page.locator('#world > g').count(),1);
    await page.locator('#library').click();
    assert.equal(await page.getByRole('button',{name:'SHELL planning surface',exact:true}).count(),2);
    assert.deepEqual(externalRequests,[]);
    assert.deepEqual(errors,[]);
    console.log('Passed empty SHELL → install all reviewed apps → reload → open each → save and reopen without cross-app data loss → Notes/Canvas portable transfer. No external network requests.');
  } finally {
    if(browser) await browser.close();
    if(server?.listening) await new Promise(resolve=>server.close(resolve));
    fs.rmSync(root,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
