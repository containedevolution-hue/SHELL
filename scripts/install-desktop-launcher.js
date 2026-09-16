'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

function shellQuote(value) { return "'" + value.replace(/'/g, "'\\''") + "'"; }
function execQuote(value) { return '"' + value.replace(/[%]/g,'%%').replace(/[\\"`$]/g, character=>'\\'+character) + '"'; }
function install({platform=process.platform, root=path.resolve(__dirname,'..'), home=os.homedir()} = {}) {
  if(platform!=='linux')throw new Error('This launcher installs only into the current Linux user’s application menu.');
  const binary=path.join(root,'src-tauri/target/release/localhub');
  fs.accessSync(binary,fs.constants.X_OK);
  const handle=fs.openSync(binary,'r'), magic=Buffer.alloc(4);
  try{fs.readSync(handle,magic,0,4,0);}finally{fs.closeSync(handle);}
  if(!magic.equals(Buffer.from([0x7f,0x45,0x4c,0x46])))throw new Error('The native Shell executable is not a Linux ELF. Build on this Linux machine first.');
  const directory=path.join(home,'.local/share/contained-evolution/shell-desktop');
  const applications=path.join(home,'.local/share/applications');
  fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(applications,{recursive:true});
  const launch=path.join(directory,'launch');
  const script=`#!/bin/sh\ncd ${shellQuote(root)} || exit 1\nexec env SHELL_DESKTOP=enabled ${shellQuote(binary)}\n`;
  fs.writeFileSync(launch,script,{mode:0o755});fs.chmodSync(launch,0o755);
  const desktop=path.join(applications,'com.containedevolution.shell-desktop.desktop');
  fs.writeFileSync(desktop,`[Desktop Entry]\nType=Application\nName=CEE OS (Development)\nComment=CEE OS desktop with native Core file navigation\nExec=${execQuote(launch)}\nIcon=system-file-manager\nTerminal=false\nCategories=System;FileManager;\nStartupNotify=true\n`);
  return desktop;
}
if(require.main===module){
  try{const result=install();spawnSync('update-desktop-database',[path.dirname(result)],{stdio:'ignore'});console.log(`Installed ${result}\nOpen CEE OS (Development) from KDE’s application launcher. Keep the Shell checkout in place; the launcher uses its native build.`);}
  catch(error){console.error(`Launcher not installed: ${error.message}\nBuild first: npm run build -- --no-bundle`);process.exitCode=1;}
}
module.exports={install,shellQuote,execQuote};
