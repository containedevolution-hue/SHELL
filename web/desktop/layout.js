(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const invoke = window.__TAURI__?.core?.invoke;
  const native = typeof invoke === 'function';
  const places = [
    {id:'files',name:'Files',icon:'folder',summary:'Folders and personal files',copy:'Browse the files connected to this computer.',sections:['Browse','Locations','Details']},
    {id:'security',name:'Security',icon:'shield',summary:'Protection, firewall and VPN',copy:'Protection, network policy, updates and recovery.',sections:['Protection','VPN','Updates','Recovery']},
    {id:'powerhouses',name:'Powerhouses',icon:'powerhouse',summary:'Specialized container environments',copy:'Contained environments assembled for your work.',sections:['Environments','Running','Collection']},
    {id:'storage',name:'Storage',icon:'storage',summary:'Devices, space and retained data',copy:'System, application and personal data locations.',sections:['This device','Removable','Synchronized']},
    {id:'connections',name:'Connections',icon:'link',summary:'Network, devices and integrations',copy:'Every connection and its approved access.',sections:['Network','Devices','Integrations']},
    {id:'activity',name:'Activity',icon:'activity',summary:'Resources and running work',copy:'Processes, workloads, resources and system events.',sections:['Live','History','Limits']}
  ];
  let currentPlace=null;
  const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const container=markup=>{const node=document.createElement('div');node.innerHTML=markup;return node;};
  function closeFlyout(restore=false){const trigger=$('notifications');$('flyout').hidden=true;trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();}
  function openNotifications(){if(!$('flyout').hidden){closeFlyout(true);return;}$('flyout-title').textContent='Notifications';$('flyout-context').textContent='CEE OS';$('flyout-content').innerHTML='<p>System notifications remain available from every surface.</p><p>No live notification feed is connected in this preview.</p>';$('flyout').classList.remove('left');$('flyout').hidden=false;$('notifications').setAttribute('aria-expanded','true');$('close-flyout').focus();}
  function announce(message){$('announcement').textContent=message;}
  function go(next,place=null,focus=true){
    window.ShellFiles.hide();closeFlyout();currentPlace=place;
    for(const id of ['desktop','core','scribble','place'])$(id).hidden=id!==next;
    if(next==='place'){$('place-title').textContent=place.name;$('place-crumb').textContent=place.name;$('place-copy').textContent=place.copy;$('place-icon').setAttribute('href',`#i-${place.icon}`);renderSpheres(place);renderSection(place,place.sections[0]);}
    window.scrollTo(0,0);announce(next==='desktop'?'Desktop':next==='core'?'Core':place.name);
    if(focus)(next==='desktop'?$('open-core'):next==='core'?$('core-title'):$('place-title')).focus({preventScroll:true});
  }
  function renderSpheres(place){
    $('place-spheres').setAttribute('aria-label',`${place.name} sections`);
    $('place-spheres').replaceChildren(...place.sections.map((section,index)=>{const button=document.createElement('button');button.type='button';button.className='section-sphere';button.dataset.section=section;button.setAttribute('aria-pressed',String(index===0));button.innerHTML=`<span>${section}</span>`;button.onclick=()=>renderSection(place,section);return button;}));
  }
  function selectSphere(section){$('place-spheres').querySelectorAll('.section-sphere').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.section===section)));}
  function sectionPanel(place,section,copy){return container(`<div class="center-panel"><p class="eyebrow">${place.name}</p><h2>${section}</h2><p>${copy}</p><span class="preview-pill">Surface preview</span></div>`);}
  function renderSection(place,section){
    selectSphere(section);window.ShellFiles.hide();$('native-files').hidden=true;$('place').classList.remove('files-page');
    const empty=document.querySelector('.empty-place');empty.hidden=false;empty.replaceChildren();
    if(place.id==='files'&&section==='Browse'){
      if(native){empty.hidden=true;$('place').classList.add('files-page');window.ShellFiles.show();}
      else empty.replaceChildren(sectionPanel(place,section,'Native folders and files appear here in the installed CEE OS desktop.'));
    }else if(place.id==='security')empty.replaceChildren(securitySurface(section));
    else if(place.id==='powerhouses')empty.replaceChildren(powerhouseSurface(section));
    else empty.replaceChildren(sectionPanel(place,section,`${section} remains centered while the clear side borders preserve folder cycling space.`));
    announce(`${place.name}, ${section}`);
  }
  async function loadSecurityEvidence(node){
    if(!native)return;const pill=node.querySelector('[data-security-source]');pill.textContent='Reading system';
    try{const status=await invoke('desktop_security_status');pill.textContent=status.platformSupported?'Live system':'Unavailable here';pill.classList.toggle('unavailable',!status.platformSupported);for(const [key,value] of Object.entries({network:status.network,vpn:status.vpn,firewall:status.firewall})){const state=node.querySelector(`[data-${key}-state]`),detail=node.querySelector(`[data-${key}-detail]`),card=node.querySelector(`[data-${key}]`);if(state)state.textContent=value.state;if(detail)detail.textContent=value.detail;if(card)card.classList.toggle('unavailable',!value.available);}}catch{pill.textContent='Evidence unavailable';pill.classList.add('unavailable');}
  }
  function evidenceCards(){return `<div class="security-cards"><section data-network><span>NetworkManager</span><strong data-network-state>${native?'Reading…':'Preview'}</strong><small data-network-detail>${native?'Reading the native network authority.':'Native evidence appears in CEE OS Linux.'}</small></section><section data-vpn><span>Active VPN</span><strong data-vpn-state>${native?'Reading…':'No preview tunnel'}</strong><small data-vpn-detail>${native?'Reading active private connections.':'No system state is invented in browser preview.'}</small></section><section data-firewall><span>Firewall</span><strong data-firewall-state>${native?'Reading…':'Local policy'}</strong><small data-firewall-detail>${native?'Reading the managed nftables service.':'Named inbound grants only.'}</small></section></div>`;}
  function securitySurface(section){
    let body='';
    if(section==='VPN')body=`<section class="security-section"><div class="section-heading"><div><p class="eyebrow">Network route</p><h3>VPN policy</h3></div><p>Choose the route Core should enforce.</p></div><div class="policy-grid" role="radiogroup" aria-label="VPN policy">${[['Direct','No tunnel required'],['Prefer VPN','Balanced default'],['Require VPN','Fail closed'],['Recovery','Repair access']].map(([name,copy],index)=>`<button type="button" role="radio" aria-checked="${index===1}" data-policy="${name}"><strong>${name}</strong><small>${copy}</small></button>`).join('')}</div></section>${evidenceCards()}`;
    else if(section==='Protection')body=evidenceCards();
    else if(section==='Updates')body='<div class="center-panel inset"><h2>Complete system updates</h2><p>CEE OS prepares recovery before applying one complete signed Arch package transaction.</p><span class="preview-pill">No update scan connected</span></div>';
    else body='<div class="center-panel inset"><h2>Recovery access</h2><p>Recovery temporarily restores a repair path without silently weakening the selected network policy.</p><span class="preview-pill">No active recovery session</span></div>';
    const node=container(`<div class="security-overview"><section class="security-summary"><div><p class="eyebrow">Core security</p><h2>${section}</h2><p>Local evidence and explicit policy stay inside Core.</p></div><span class="preview-pill" data-security-source>${native?'Reading system':'Preview data'}</span></section>${body}</div>`);
    node.querySelectorAll('[data-policy]').forEach(button=>button.onclick=()=>{node.querySelectorAll('[data-policy]').forEach(item=>item.setAttribute('aria-checked','false'));button.setAttribute('aria-checked','true');announce(`${button.dataset.policy} selected for configuration.`);});loadSecurityEvidence(node);return node;
  }
  async function loadPowerhouses(node){
    if(!native)return;const source=node.querySelector('[data-powerhouse-source]');source.textContent='Reading engine';
    try{const status=await invoke('desktop_powerhouse_status');source.textContent=status.platformSupported?'Live system':'Unavailable here';node.querySelector('[data-engine]').textContent=status.engine;node.querySelector('[data-rootless]').textContent=status.rootless===true?'Enabled':status.rootless===false?'Disabled':'Unavailable';node.querySelector('[data-count]').textContent=String(status.entries.length);const list=node.querySelector('[data-powerhouse-list]');list.replaceChildren();if(status.entries.length)for(const entry of status.entries){const item=document.createElement('article');item.className='powerhouse-row';item.innerHTML=`${icon('powerhouse')}<span><strong></strong><small></small></span><em></em>`;item.querySelector('strong').textContent=entry.name;item.querySelector('small').textContent=entry.image;item.querySelector('em').textContent=entry.state;list.append(item);}else{const p=document.createElement('p');p.className='powerhouse-empty';p.textContent=status.problem||'No Powerhouses are installed.';list.append(p);}}catch{source.textContent='Discovery unavailable';}
  }
  function powerhouseSurface(section){
    if(section==='Collection'){const node=sectionPanel(currentPlace,section,'Applications checked out to this device connect to Powerhouses through Core.');if(native){const button=document.createElement('button');button.className='file-action';button.textContent='Open app collection';button.onclick=()=>invoke('desktop_open_apps');node.append(button);}return node;}
    const node=container(`<div class="powerhouse-overview"><section class="powerhouse-summary"><div><p class="eyebrow">Core orchestration</p><h2>${section}</h2><p>Specialized environments remain independently contained.</p></div><span class="preview-pill" data-powerhouse-source>${native?'Reading engine':'Preview data'}</span></section><div class="powerhouse-metrics"><section><span>Engine</span><strong data-engine>${native?'Reading…':'Podman'}</strong></section><section><span>Rootless</span><strong data-rootless>${native?'Reading…':'Required'}</strong></section><section><span>Installed</span><strong data-count>0</strong></section></div><section class="powerhouse-list"><div data-powerhouse-list><p class="powerhouse-empty">${native?'Reading local Powerhouses…':'Native discovery appears in CEE OS Linux.'}</p></div></section></div>`);loadPowerhouses(node);return node;
  }
  $('core-places').replaceChildren(...places.map(place=>{const node=document.createElement('button');node.className='place-button';node.type='button';node.dataset.place=place.id;node.innerHTML=`${icon(place.icon)}<span><strong>${place.name}</strong><small>${place.summary}</small></span>`;node.onclick=()=>go('place',place);return node;}));
  $('home').onclick=()=>go('desktop');$('open-core').onclick=()=>go('core');$('notifications').onclick=openNotifications;$('close-flyout').onclick=()=>closeFlyout(true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('flyout').hidden){event.preventDefault();closeFlyout(true);}});document.addEventListener('pointerdown',event=>{if(!$('flyout').hidden&&!$('flyout').contains(event.target)&&!$('notifications').contains(event.target))closeFlyout();});
  function drawBar(){const width=document.documentElement.clientWidth,mid=width/2;const contour=`M0 72H${mid-59}C${mid-43} 72 ${mid-45} 112 ${mid} 112C${mid+45} 112 ${mid+43} 72 ${mid+59} 72H${width}`;$('bar-fill').setAttribute('d',`${contour}V0H0Z`);$('bar-line').setAttribute('d',contour);}
  new ResizeObserver(drawBar).observe(document.documentElement);drawBar();go('desktop',null,false);if(native)$('desktop-caption').textContent='CEE OS · Development';
})();
