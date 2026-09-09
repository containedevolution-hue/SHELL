(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const places = [
    { id:'files', name:'Files', icon:'folder', summary:'Folders, drives & storage', copy:'Browse the files and storage connected to this computer.', empty:'The file listing will be designed next. This layout does not read or change your files.' },
    { id:'apps', name:'Applications', icon:'grid', summary:'System & installed apps', copy:'A place for the applications on your computer.', empty:'Application discovery is not connected in this layout study.' },
    { id:'connections', name:'Connections', icon:'link', summary:'Devices, mounts & integrations', copy:'See where your computer connects.', empty:'Connection state is unavailable in this layout study.' },
    { id:'memory', name:'Memory Box', icon:'memory', summary:'Assistant memory & boot files', copy:'Inspect assistant memory and boot configuration under Shell custody.', empty:'Memory Box and its optional SEED source are not connected in this layout study.' },
    { id:'system', name:'System activity', icon:'activity', summary:'Resources & running work', copy:'Understand the activity on your computer.', empty:'Live system readings are unavailable in this layout study.' }
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
      $('page-menus').append(back,button('View','view',trigger=>showOutline('View',name,['List','Grid','Details'],trigger)));
    }
    if (next === 'place') {
      $('place-title').textContent=place.name; $('place-crumb').textContent=place.name;
      $('place-copy').textContent=place.copy; $('place-empty').textContent=place.empty;
      $('place-icon').setAttribute('href',`#i-${place.icon}`);
    }
    window.scrollTo(0,0); $('announcement').textContent=`${name}. Settings now opens ${next === 'desktop' ? 'base' : name} settings.`;
    if (focus) (next === 'desktop' ? $('open-core') : $(`${next}-title`)).focus({preventScroll:true});
  }
  function showApps(trigger) {
    const content = container('<p>Open a context example.</p>');
    content.append(row('Scribble','Demonstrates app menus and settings','grid',()=>go('scribble')));
    openMenu('apps','Applications','Desktop',trigger,content,true);
  }
  function showOutline(title, context, items, trigger) {
    const content=container(`<ul class="settings-list">${items.map(item=>`<li>${item}</li>`).join('')}</ul><p>Menu outline. These actions are not connected in this study.</p>`);
    openMenu(title,title,context,trigger,content,true);
  }
  function showView(trigger) {
    const content=container(`<label class="view-choice"><input id="compact-seed" type="checkbox" ${document.body.dataset.seedSize === 'small' ? 'checked' : ''}> Smaller Core icon</label><label class="view-choice"><input id="blink-seed" type="checkbox" ${document.body.dataset.blink !== 'off' ? 'checked' : ''}> Blinking eyes</label><p>Preview preferences last until this page reloads. Reduced-motion settings always disable blinking.</p>`);
    content.querySelector('#compact-seed').onchange=e=>document.body.dataset.seedSize=e.target.checked?'small':'normal';
    content.querySelector('#blink-seed').onchange=e=>document.body.dataset.blink=e.target.checked?'on':'off';
    openMenu('view','Desktop view','Desktop',trigger,content,true);
  }
  function showSettings() {
    const isDesktop=current==='desktop', name=contextName();
    const items=isDesktop ? ['Appearance','Display & accessibility','Sound','Network & devices','Storage & permissions'] : current==='scribble' ? ['Writing preferences','Page appearance','Spelling & language','Keyboard shortcuts'] : ['Layout & navigation','Search & indexing','Visible details'];
    const content=container(`<ul class="settings-list">${items.map(item=>`<li>${item}</li>`).join('')}</ul><p>Proposed settings categories. No device or app settings are changed here.</p>`);
    openMenu('settings',isDesktop?'Base settings':`${name} settings`,name,$('settings'),content);
  }
  function showSearch() {
    const content=container('<label class="search-label" for="layout-search">Find a destination in this study</label><input class="search-input" id="layout-search" type="search" placeholder="Core, Files, Scribble…"><div id="search-results"></div>');
    const targets=[{name:'Desktop',description:'Return home',icon:'view',action:()=>go('desktop')},{name:'Core',description:'Files and computer',icon:'folder',action:()=>go('core')},...places.map(place=>({name:place.name,description:place.summary,icon:place.icon,action:()=>go('place',place)})),{name:'Scribble',description:'App context example',icon:'grid',action:()=>go('scribble')}];
    const render=query=>{const results=content.querySelector('#search-results');results.replaceChildren();const matches=targets.filter(item=>item.name.toLowerCase().includes(query.toLowerCase()));for(const item of matches)results.append(row(item.name,item.description,item.icon,item.action));if(!matches.length)results.textContent='No matching destinations.';};
    render(''); content.querySelector('input').oninput=e=>render(e.target.value);
    openMenu('search',`Search ${contextName()}`,contextName(),$('search'),content);
  }
  $('core-places').replaceChildren(...places.map(place=>{
    const node=document.createElement('button');node.className='place-button';node.type='button';
    node.innerHTML=`${icon(place.icon)}<span><strong>${place.name}</strong><small>${place.summary}</small></span>${icon('arrow')}`;
    node.onclick=()=>go('place',place);return node;
  }));
  $('home').onclick=()=>go('desktop'); $('open-core').onclick=()=>go('core'); $('settings').onclick=showSettings; $('search').onclick=showSearch;
  $('notifications').onclick=()=>openMenu('notifications','Notifications','Shell',$('notifications'),container('<p>System notifications will stay here across pages.</p><p>No live notification feed is connected in this study.</p>'));
  $('close-flyout').onclick=()=>closeMenu(true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && opened){event.preventDefault();closeMenu(true);}});
  document.addEventListener('pointerdown',event=>{if(opened && !$('flyout').contains(event.target) && !(opener && opener.contains(event.target))) closeMenu();});
  function drawBar() {
    const width=document.documentElement.clientWidth, mid=width/2;
    const contour=`M0 72H${mid-59}C${mid-43} 72 ${mid-45} 112 ${mid} 112C${mid+45} 112 ${mid+43} 72 ${mid+59} 72H${width}`;
    $('bar-fill').setAttribute('d',`${contour}V0H0Z`); $('bar-line').setAttribute('d',contour);
  }
  new ResizeObserver(drawBar).observe(document.documentElement); drawBar(); go('desktop',null,false);
})();
