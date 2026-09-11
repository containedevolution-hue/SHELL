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
      if(native && place.id==='powerhouses') {
        $('place-empty').replaceChildren(row('Open applications','Installed CE apps and the app collection','grid',()=>nativeAction('desktop_open_apps')));
      }
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
