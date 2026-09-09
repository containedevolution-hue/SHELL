/* Shell-owned native filesystem view. All access is validated again in Rust. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const invoke = window.__TAURI__?.core?.invoke;
  let roots = [], listing = null, selected = null, request = 0, visible = false;
  const message = value => { $('files-message').textContent = value; };
  const errorText = error => typeof error === 'string' ? error : error?.message || 'The request could not finish.';
  const readable = path => path.replace(/^\\\\\?\\/, '');
  function size(bytes) {
    if (bytes === null || bytes === undefined) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB','MB','GB','TB']; let value = bytes / 1024, unit = 0;
    while (value >= 1024 && unit < units.length-1) { value /= 1024; unit++; }
    return `${value.toLocaleString(undefined,{maximumFractionDigits:1})} ${units[unit]}`;
  }
  function button(text, action, className = 'file-action') {
    const node = document.createElement('button'); node.type='button';node.className=className;node.textContent=text;node.onclick=action;return node;
  }
  async function loadRoots() {
    roots = await invoke('desktop_roots');
    $('file-roots').replaceChildren(...roots.map(root=>button(root.name,()=>load(root.path),'root-button')));
  }
  function crumbs(path) {
    const nav = $('file-breadcrumbs'); nav.replaceChildren();
    const root = roots.filter(root=>path === root.path || path.startsWith(root.path.replace(/[\\/]$/,'') + (path.includes('\\')?'\\':'/'))).sort((a,b)=>b.path.length-a.path.length)[0];
    if (!root) { nav.textContent=readable(path);return; }
    nav.append(button(root.name,()=>load(root.path),'crumb'));
    let target=root.path.replace(/[\\/]$/,'');
    const separator=path.includes('\\')?'\\':'/';
    for(const segment of path.slice(root.path.length).split(/[\\/]/).filter(Boolean)) {
      target+=separator+segment; const destination=target;
      const divider=document.createElement('span');divider.textContent='/';divider.setAttribute('aria-hidden','true');
      nav.append(divider,button(segment,()=>load(destination),'crumb'));
    }
  }
  function details(entry) {
    selected=entry;$('file-details').hidden=false;$('file-name').textContent=entry.name;
    $('file-properties').replaceChildren();
    const values=[['Location',readable(entry.path)],['Type',entry.kind],['Size',size(entry.size)],['Modified',entry.modifiedAt ? new Date(entry.modifiedAt*1000).toLocaleString():'Unavailable']];
    for(const [name,value] of values){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;$('file-properties').append(dt,dd);}
    $('file-open').disabled=!entry.canOpen;
    $('file-open-state').textContent=entry.problem || (entry.canOpen ? '' : 'Opening this file type is not supported yet.');
    $('file-rows').querySelectorAll('button').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.path===entry.path)));
  }
  function render() {
    $('file-rows').replaceChildren(); if(!listing)return;
    const query=$('files-filter').value.toLocaleLowerCase();
    const entries=listing.entries.filter(entry=>entry.name.toLocaleLowerCase().includes(query));
    for(const entry of entries){
      const tr=document.createElement('tr'),name=document.createElement('td'),kind=document.createElement('td'),bytes=document.createElement('td');
      const item=button(entry.name,()=>entry.kind==='folder'?load(entry.path):details(entry),'file-name-button');
      item.dataset.path=entry.path;item.setAttribute('aria-label',`${entry.name}, ${entry.kind}`);item.setAttribute('aria-pressed',String(selected?.path===entry.path));
      name.append(item);kind.textContent=entry.kind;bytes.textContent=size(entry.size);tr.append(name,kind,bytes);$('file-rows').append(tr);
    }
    message(`${entries.length} ${entries.length===1?'item':'items'}${query?' matching this filter':''}.${listing.truncated?' This large folder was limited to 5,000 entries; some items are not shown.':''}`);
  }
  async function load(path) {
    const ticket=++request;listing=null;selected=null;
    $('file-details').hidden=true;$('file-rows').replaceChildren();$('files-up').disabled=true;$('files-filter').value='';
    message('Reading folder…');$('native-files').setAttribute('aria-busy','true');
    try {
      const result=await invoke('desktop_list',{path,hidden:$('files-hidden').checked});
      if(ticket!==request || !visible)return;
      listing=result;crumbs(result.path);$('files-location').value=readable(result.path);$('files-up').disabled=!result.parent;render();
    } catch(error){if(ticket===request && visible)message(errorText(error));}
    finally {if(ticket===request)$('native-files').setAttribute('aria-busy','false');}
  }
  $('files-up').onclick=()=>{if(listing?.parent)load(listing.parent);};
  $('files-location-form').onsubmit=event=>{event.preventDefault();load($('files-location').value);};
  $('files-refresh').onclick=()=>{if(listing)load(listing.path);else if(roots[0])load(roots[0].path);};
  $('files-filter').oninput=()=>{selected=null;$('file-details').hidden=true;render();};
  $('files-hidden').onchange=()=>{if(listing)load(listing.path);};
  $('files-add').onclick=async()=>{
    $('files-add').disabled=true;
    try{const root=await invoke('desktop_pick_folder');if(root){await loadRoots();if(visible)await load(root.path);}}
    catch(error){if(visible)message(errorText(error));}finally{$('files-add').disabled=false;}
  };
  $('file-open').onclick=async()=>{
    const entry=selected;if(!entry?.canOpen)return;
    $('file-open').disabled=true;$('file-open-state').textContent='Opening…';
    try{await invoke('desktop_open_file',{path:entry.path});if(selected===entry)$('file-open-state').textContent='Sent to your default application.';}
    catch(error){if(selected===entry)$('file-open-state').textContent=errorText(error);}
    finally{if(selected===entry)$('file-open').disabled=!entry.canOpen;}
  };
  window.ShellFiles = {
    async show(){
      visible=true;$('native-files').hidden=false;
      if(listing){render();return;}
      const ticket=++request;message('Reading locations…');
      try{await loadRoots();if(!visible || ticket!==request)return;if(roots[0])await load(roots[0].path);else message('No standard folders are available. Use Add folder to choose one.');}
      catch(error){if(visible && ticket===request)message(errorText(error));}
    },
    hide(){visible=false;++request;$('native-files').hidden=true;$('native-files').setAttribute('aria-busy','false');}
  };
})();
