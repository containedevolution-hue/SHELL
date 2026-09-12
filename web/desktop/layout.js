(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const invoke = window.__TAURI__?.core?.invoke;
  const native = typeof invoke === 'function';
  async function nativeAction(command) {
    closeMenu();
    try { await invoke(command); }
    catch(error) { const node=$('announcement');node.classList.remove('sr-only');node.classList.add('desktop-error');node.textContent=typeof error==='string'?error:error.message; }
  }
  const places = [
    { id:'files', name:'Files', icon:'folder', summary:'Folders and personal files', copy:'Browse the files connected to this computer.', empty:'Native file access becomes available in the installed CEE OS desktop.', menus:[['File','folder',['New folder','Add location','Properties']],['View','view',['List','Grid','Details']]] },
    { id:'security', name:'Security', icon:'shield', summary:'Protection, firewall and VPN', copy:'Review protection, network policy, updates and recovery.', empty:'Security controls will report local evidence and require clear approval before changing the system.', menus:[['Protection','shield',['Overview','Firewall','Updates']],['VPN','link',['Direct','Prefer VPN','Require VPN','Recovery']]] },
    { id:'powerhouses', name:'Powerhouses', icon:'powerhouse', summary:'Specialized container environments', copy:'Start, stop and inspect the environments assembled for your work.', empty:'Powerhouses will show installed environments, their containers and the capabilities each one can use.', menus:[['Powerhouses','powerhouse',['Start','Stop','Create']],['View','view',['Running','Installed','Available']]] },
    { id:'storage', name:'Storage', icon:'storage', summary:'Devices, space and retained data', copy:'See where system, application and personal data lives.', empty:'Storage will separate this device, removable media and optional synchronized storage.', menus:[['Storage','storage',['This device','Removable','Synchronized']],['View','view',['Usage','Locations','Health']]] },
    { id:'connections', name:'Connections', icon:'link', summary:'Network, devices and integrations', copy:'See what CEE OS connects to and what each connection can access.', empty:'Connections will show network, devices, mounts and approved integrations in one place.', menus:[['Connect','link',['Network','Device','Integration']],['View','view',['Active','Available','History']]] },
    { id:'activity', name:'Activity', icon:'activity', summary:'Resources and running work', copy:'Understand what is running and how the computer is responding.', empty:'Activity will show processes, powerhouse workloads, resource use and system events.', menus:[['Processes','activity',['Running work','Background services','Powerhouses']],['View','view',['Live','History','Limits']]] }
  ];
  let current = 'desktop', currentPlace = null, opened = null, opener = null;
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  function button(label, symbol, action) {
    const node = document.createElement('button');
    node.className = 'bar-button'; node.type = 'button';
    node.setAttribute('aria-label', label); node.setAttribute('aria-expanded','false'); node.setAttribute('aria-controls','flyout');
    node.innerHTML = `${icon(symbol)}<span>${label}</span>`;
    node.onclick = () => action(node); return node;
  }
  function closeMenu(restore = false) {
    const previous = opener;
    $('flyout').hidden = true; opened = null; opener = null;
    document.querySelectorAll('[aria-expanded]').forEach(node => node.setAttribute('aria-expanded','false'));
    if (restore && previous && previous.isConnected) previous.focus();
  }
  function openMenu(key, title, context, trigger, content, left = false) {
    if (opened === key) { closeMenu(true); return; }
    closeMenu(); opened = key; opener = trigger;
    $('flyout-title').textContent = title; $('flyout-context').textContent = context;
    $('flyout-content').replaceChildren(content);
    $('flyout').classList.toggle('left',left); $('flyout').hidden = false;
    trigger.setAttribute('aria-expanded','true');
    ($('flyout-content').querySelector('input,button:not(:disabled)') || $('close-flyout')).focus();
  }
  function container(markup) { const node = document.createElement('div'); node.innerHTML = markup; return node; }
  function row(name, description, symbol, action) {
    const node = document.createElement('button'); node.className='menu-row'; node.type='button';
    node.innerHTML=`${icon(symbol)}<span><strong>${name}</strong><small>${description}</small></span>`;
    node.onclick=action; return node;
  }
  async function loadSecurityEvidence(node) {
    if(!native)return;
    const pill=node.querySelector('[data-security-source]');pill.textContent='Reading system';
    try{
      const status=await invoke('desktop_security_status');
      pill.textContent=status.platformSupported?'Live system':'Unavailable here';
      pill.classList.toggle('unavailable',!status.platformSupported);
      for(const [key,value] of Object.entries({network:status.network,vpn:status.vpn,firewall:status.firewall})){
        node.querySelector(`[data-${key}-state]`).textContent=value.state;
        node.querySelector(`[data-${key}-detail]`).textContent=value.detail;
        node.querySelector(`[data-${key}]`).classList.toggle('unavailable',!value.available);
      }
    }catch(error){pill.textContent='Evidence unavailable';pill.classList.add('unavailable');}
  }
  function securitySurface() {
    const node=container(`<div class="security-overview">
      <section class="security-summary"><div><span class="status-dot"></span><p class="eyebrow">Core security</p><h2>Protection center</h2><p>Local protection, network policy and recovery controls stay together inside Core.</p></div><span class="preview-pill" data-security-source>${native?'Reading system':'Preview data'}</span></section>
      <section class="security-section"><div class="section-heading"><div><p class="eyebrow">Network route</p><h3>VPN policy</h3></div><p id="vpn-policy-copy">Use the VPN when it is available and return to the direct connection when it is not.</p></div><div class="policy-grid" role="radiogroup" aria-label="VPN policy">
        <button type="button" role="radio" aria-checked="false" data-policy="Direct" data-copy="Use the direct network connection without starting a VPN tunnel."><strong>Direct</strong><small>No tunnel required</small></button>
        <button type="button" role="radio" aria-checked="true" data-policy="Prefer VPN" data-copy="Use the VPN when it is available and return to the direct connection when it is not."><strong>Prefer VPN</strong><small>Balanced default</small></button>
        <button type="button" role="radio" aria-checked="false" data-policy="Require VPN" data-copy="Block ordinary network traffic whenever the approved VPN tunnel is unavailable."><strong>Require VPN</strong><small>Fail closed</small></button>
        <button type="button" role="radio" aria-checked="false" data-policy="Recovery" data-copy="Temporarily restore direct access so a broken VPN profile can be repaired."><strong>Recovery</strong><small>Repair access</small></button>
      </div></section>
      <div class="security-cards"><section data-network><span>NetworkManager</span><strong data-network-state>${native?'Reading…':'Preview'}</strong><small data-network-detail>${native?'Reading the native network authority.':'Native evidence appears in the installed Linux desktop.'}</small></section><section data-vpn><span>Active VPN</span><strong data-vpn-state>${native?'Reading…':'No preview tunnel'}</strong><small data-vpn-detail>${native?'Reading active private connections.':'Policy choices above are interface-only in this browser preview.'}</small></section><section data-firewall><span>Firewall</span><strong data-firewall-state>${native?'Reading…':'Local policy'}</strong><small data-firewall-detail>${native?'Reading the managed nftables service.':'Inbound traffic is denied unless a named service is approved.'}</small></section></div>
    </div>`);
    node.querySelectorAll('[data-policy]').forEach(button=>button.onclick=()=>{
      node.querySelectorAll('[data-policy]').forEach(item=>item.setAttribute('aria-checked','false'));
      button.setAttribute('aria-checked','true');$('vpn-policy-copy').textContent=button.dataset.copy;
      $('announcement').textContent=`${button.dataset.policy} selected for this preview.`;
    });
    loadSecurityEvidence(node);
    return node;
  }
  async function loadPowerhouses(node) {
    if(!native)return;
    const source=node.querySelector('[data-powerhouse-source]');source.textContent='Reading engine';
    try{
      const status=await invoke('desktop_powerhouse_status');
      source.textContent=status.platformSupported?'Live system':'Unavailable here';
      node.querySelector('[data-engine]').textContent=status.engine;
      node.querySelector('[data-rootless]').textContent=status.rootless===true?'Enabled':status.rootless===false?'Disabled':'Unavailable';
      node.querySelector('[data-count]').textContent=String(status.entries.length);
      const list=node.querySelector('[data-powerhouse-list]');list.replaceChildren();
      if(status.entries.length){
        for(const entry of status.entries){
          const item=document.createElement('article');item.className='powerhouse-row';
          item.innerHTML=`${icon('powerhouse')}<span><strong></strong><small></small></span><em></em>`;
          item.querySelector('strong').textContent=entry.name;item.querySelector('small').textContent=entry.image;item.querySelector('em').textContent=entry.state;list.append(item);
        }
      }else{
        const empty=document.createElement('p');empty.className='powerhouse-empty';empty.textContent=status.problem||'No Powerhouses are installed on this device.';list.append(empty);
      }
    }catch(error){source.textContent='Discovery unavailable';node.querySelector('[data-powerhouse-list]').textContent='The local container engine could not be read.';}
  }
  function powerhouseSurface() {
    const node=container(`<div class="powerhouse-overview">
      <section class="powerhouse-summary"><div><p class="eyebrow">Core orchestration</p><h2>Powerhouses</h2><p>Specialized environments stay independently contained and connect through Core.</p></div><span class="preview-pill" data-powerhouse-source>${native?'Reading engine':'Preview data'}</span></section>
      <div class="powerhouse-metrics"><section><span>Engine</span><strong data-engine>${native?'Reading…':'Podman'}</strong></section><section><span>Rootless</span><strong data-rootless>${native?'Reading…':'Required'}</strong></section><section><span>Installed</span><strong data-count>0</strong></section></div>
      <section class="powerhouse-list"><div class="section-heading"><div><p class="eyebrow">This device</p><h3>Environments</h3></div>${native?'<button type="button" class="file-action" data-open-apps>Open app collection</button>':''}</div><div data-powerhouse-list><p class="powerhouse-empty">${native?'Reading local Powerhouses…':'Native container discovery appears in the installed Linux desktop.'}</p></div></section>
    </div>`);
    node.querySelector('[data-open-apps]')?.addEventListener('click',()=>nativeAction('desktop_open_apps'));
    loadPowerhouses(node);return node;
  }
  function contextName() { return current === 'desktop' ? 'Desktop' : current === 'scribble' ? 'Scribble' : current === 'core' ? 'Core' : currentPlace.name; }
  function go(next, place = null, focus = true) {
    window.ShellFiles.hide();
    $('announcement').className='sr-only';
    closeMenu(); current = next; currentPlace = place;
    for (const id of ['desktop','core','scribble','place']) $(id).hidden = id !== next;
    const name = contextName(); $('context-name').textContent = name;
    $('settings').setAttribute('aria-label',`${name} settings`); $('search').setAttribute('aria-label',`Search ${name}`);
    $('page-menus').setAttribute('aria-label',`${name} menus`); $('page-menus').replaceChildren();
    if (next === 'desktop') {
      $('page-menus').append(button('Apps','grid',showApps),button('View','view',showView));
    } else if (next === 'scribble') {
      $('page-menus').append(button('File','folder',trigger=>showOutline('File','Scribble', ['New document','Open document','Export'],trigger)),button('Edit','view',trigger=>showOutline('Edit','Scribble',['Undo','Redo','Find'],trigger)));
    } else {
      const back = button(next === 'place' ? 'Back to Core' : 'Desktop','back',()=>go(next === 'place' ? 'core' : 'desktop'));
      back.removeAttribute('aria-expanded'); back.removeAttribute('aria-controls');
      $('page-menus').append(back);
      const menus=next==='place' ? place.menus : [['View','view',['Map','Status','Details']]];
      for(const [label,symbol,items] of menus) $('page-menus').append(button(label,symbol,trigger=>showOutline(label,name,items,trigger)));
    }
    if (next === 'place') {
      $('place-title').textContent=place.name; $('place-crumb').textContent=place.name;
      $('place-copy').textContent=place.copy; $('place-empty').textContent=place.empty;
      $('place-icon').setAttribute('href',`#i-${place.icon}`);
      const files=native && place.id==='files';
      document.querySelector('.empty-place').hidden=files;
      $('place').classList.toggle('files-page',files);
      if(files){$('place-copy').textContent='Browse this computer. Open files in their default applications.';window.ShellFiles.show();}
      if(place.id==='security') $('place-empty').replaceChildren(securitySurface());
      if(place.id==='powerhouses') $('place-empty').replaceChildren(powerhouseSurface());
    }
    window.scrollTo(0,0); $('announcement').textContent=`${name}. Settings now opens ${next === 'desktop' ? 'base' : name} settings.`;
    if (focus) (next === 'desktop' ? $('open-core') : $(`${next}-title`)).focus({preventScroll:true});
  }
  function showApps(trigger) {
    if(native){nativeAction('desktop_open_apps');return;}
    const content = container('<p>Open a context example.</p>');
    content.append(row('Scribble','Demonstrates app menus and settings','grid',()=>go('scribble')));
    openMenu('apps','Applications','Desktop',trigger,content,true);
  }
  function showOutline(title, context, items, trigger) {
    if(native){
      if(current==='place' && currentPlace.id==='files'){
        const content=container(`<label class="view-choice"><input id="menu-hidden-files" type="checkbox" ${$('files-hidden').checked?'checked':''}> Show hidden files</label><p>Files are listed with their type and size. Select a file for details.</p>`);
        content.querySelector('input').onchange=e=>{$('files-hidden').checked=e.target.checked;$('files-hidden').dispatchEvent(new Event('change'));};
        openMenu(title,title,context,trigger,content,true);return;
      }
      openMenu(title,title,context,trigger,container('<p>This surface uses its default layout. Additional views are not available yet.</p>'),true);return;
    }
    const content=container(`<ul class="settings-list">${items.map(item=>`<li>${item}</li>`).join('')}</ul><p>Menu outline. These actions are not connected in this study.</p>`);
    openMenu(title,title,context,trigger,content,true);
  }
  function showView(trigger) {
    const content=container(`<label class="view-choice"><input id="compact-core" type="checkbox" ${document.body.dataset.coreSize === 'small' ? 'checked' : ''}> Smaller Core emblem</label><label class="view-choice"><input id="pulse-core" type="checkbox" ${document.body.dataset.corePulse !== 'off' ? 'checked' : ''}> Core energy pulse</label><p>Preview preferences last until this page reloads. Reduced-motion settings always disable the pulse.</p>`);
    content.querySelector('#compact-core').onchange=e=>document.body.dataset.coreSize=e.target.checked?'small':'normal';
    content.querySelector('#pulse-core').onchange=e=>document.body.dataset.corePulse=e.target.checked?'on':'off';
    openMenu('view','Desktop view','Desktop',trigger,content,true);
  }
  function showSettings() {
    const isDesktop=current==='desktop', name=contextName();
    if(native){
      if(isDesktop || current==='core'){nativeAction('desktop_system_settings');return;}
      if(current==='place' && currentPlace.id==='files'){
        const content=container('<p>Use Hidden files and the folder filter in Files to choose what is shown. Added folder locations last for this CEE OS session.</p>');
        openMenu('settings','Files settings','Files',$('settings'),content);return;
      }
    }
    const items=isDesktop ? ['Appearance','Display & accessibility','Sound','Network & devices','Storage & permissions'] : current==='scribble' ? ['Writing preferences','Page appearance','Spelling & language','Keyboard shortcuts'] : ['Layout & navigation','Search & indexing','Visible details'];
    const content=container(`<ul class="settings-list">${items.map(item=>`<li>${item}</li>`).join('')}</ul><p>Proposed settings categories. No device or app settings are changed here.</p>`);
    openMenu('settings',isDesktop?'Base settings':`${name} settings`,name,$('settings'),content);
  }
  function showSearch() {
    const content=container('<label class="search-label" for="layout-search">Find a destination in this study</label><input class="search-input" id="layout-search" type="search" placeholder="Core, Files, Scribble…"><div id="search-results"></div>');
    if(native){content.querySelector('label').textContent='Find a CEE OS destination';content.querySelector('input').placeholder='Core, Files, Applications…';}
    const targets=[{name:'Desktop',description:'Return home',icon:'view',action:()=>go('desktop')},{name:'Core',description:'System foundation',icon:'shield',action:()=>go('core')},...places.map(place=>({name:place.name,description:place.summary,icon:place.icon,action:()=>go('place',place)})),...(native?[]:[{name:'Scribble',description:'App context example',icon:'grid',action:()=>go('scribble')}])];
    const render=query=>{const results=content.querySelector('#search-results');results.replaceChildren();const matches=targets.filter(item=>item.name.toLowerCase().includes(query.toLowerCase()));for(const item of matches)results.append(row(item.name,item.description,item.icon,item.action));if(!matches.length)results.textContent='No matching destinations.';};
    render(''); content.querySelector('input').oninput=e=>render(e.target.value);
    openMenu('search',`Search ${contextName()}`,contextName(),$('search'),content);
  }
  $('core-places').replaceChildren(...places.map(place=>{
    const node=document.createElement('button');node.className='place-button';node.type='button';
    node.dataset.place=place.id;node.innerHTML=`${icon(place.icon)}<span><strong>${place.name}</strong><small>${place.summary}</small></span>${icon('arrow')}`;
    node.onclick=()=>go('place',place);return node;
  }));
  $('home').onclick=()=>go('desktop'); $('open-core').onclick=()=>go('core'); $('settings').onclick=showSettings; $('search').onclick=showSearch;
  $('notifications').onclick=()=>openMenu('notifications','Notifications','CEE OS',$('notifications'),container('<p>System notifications stay here across pages.</p><p>No live notification feed is connected in this preview.</p>'));
  $('close-flyout').onclick=()=>closeMenu(true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && opened){event.preventDefault();closeMenu(true);}});
  document.addEventListener('pointerdown',event=>{if(opened && !$('flyout').contains(event.target) && !(opener && opener.contains(event.target))) closeMenu();});
  function drawBar() {
    const width=document.documentElement.clientWidth, mid=width/2;
    const contour=`M0 72H${mid-59}C${mid-43} 72 ${mid-45} 112 ${mid} 112C${mid+45} 112 ${mid+43} 72 ${mid+59} 72H${width}`;
    $('bar-fill').setAttribute('d',`${contour}V0H0Z`); $('bar-line').setAttribute('d',contour);
  }
  new ResizeObserver(drawBar).observe(document.documentElement); drawBar(); go('desktop',null,false);
  if(native){
    $('desktop-caption').textContent='CEE OS · Development';
    $('core-note').textContent='Files and the application launcher are connected. Security, storage, connections and activity remain preview surfaces.';
  }
})();
