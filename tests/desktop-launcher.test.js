'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {install,shellQuote,execQuote}=require('../scripts/install-desktop-launcher');
test('Linux launcher is per-user, quotes its checkout and never enables a login session',()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'shell-desktop-launcher-'));
 try{
  const root=path.join(temporary,"source with ' space"),home=path.join(temporary,'owner % $ home');
  const binary=path.join(root,'src-tauri/target/release/localhub');fs.mkdirSync(path.dirname(binary),{recursive:true});fs.writeFileSync(binary,Buffer.from([0x7f,0x45,0x4c,0x46]),{mode:0o755});
  const file=install({platform:'linux',root,home});assert(file.startsWith(home));
  const desktop=fs.readFileSync(file,'utf8');assert.match(desktop,/Terminal=false/);assert.match(desktop,/%%/);assert.doesNotMatch(desktop,/autostart|sudo|systemctl/);
  const launch=fs.readFileSync(path.join(home,'.local/share/contained-evolution/shell-desktop/launch'),'utf8');
  assert(launch.includes(shellQuote(binary)));assert.match(launch,/SHELL_DESKTOP=enabled/);
  fs.writeFileSync(binary,'not ELF');assert.throws(()=>install({platform:'linux',root,home}),/not a Linux ELF/);
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
test('launcher refuses other platforms and escapes shell and desktop-entry expansion',()=>{
 assert.throws(()=>install({platform:'win32'}),/only.*Linux/);
 assert.equal(shellQuote("a'b"),"'a'\\''b'");assert.equal(execQuote('a%f$b'), '"a%%f\\$b"');
});
