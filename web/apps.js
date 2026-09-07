(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let catalog = [], token = null;
  const localSessions = new Map();
  const invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
  // The native app always talks to its fixed process-owned sidecar. A Tauri
  // development/webview origin may also be loopback, but it is not API authority.
  // The standalone browser host intentionally serves UI and API on one origin.
  const origin = invoke ? 'http://127.0.0.1:5984'
    : location.protocol === 'http:' && location.hostname === '127.0.0.1' ? location.origin : 'http://127.0.0.1:5984';
  const requestId = () => window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  async function json(path, options = {}) {
    const response = await fetch(origin + path, options);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !/^application\/json(?:;|$)/i.test(contentType)) {
      throw new Error(response.ok ? 'SHELL reached the wrong local service. Retry after local services start.'
        : 'Start SHELL’s local services to open your apps.');
    }
    return response.json();
  }
  async function localMutationHeaders(scope) {
    if (!invoke) return null;
    let localSession = localSessions.get(scope);
    if (!localSession || Date.now() + 10000 >= localSession.expiresAt) {
      const bootstrap = await invoke('shell_local_auth_bootstrap');
      const response = await fetch(origin + '/v1/local-auth/session', {
        method:'POST', headers:{'Content-Type':'application/json','X-Shell-Bootstrap':bootstrap,'X-Shell-Caller':'main'},
        body:JSON.stringify({scopes:[scope]})
      });
      if (!response.ok) throw new Error('SHELL could not authenticate this app window.');
      localSession = await response.json();
      localSessions.set(scope, localSession);
    }
    return {'Authorization':'Bearer ' + localSession.token,'X-Shell-Caller':'main','X-Shell-Request-Id':requestId()};
  }
  function tab(store) {
    $('mine').hidden = store; $('store').hidden = !store;
    $('mine-tab').setAttribute('aria-selected', String(!store)); $('store-tab').setAttribute('aria-selected', String(store));
  }
  $('mine-tab').onclick = () => tab(false); $('store-tab').onclick = () => tab(true);
  function launch(url) {
    if (!/^\/v1\/apps\/[a-z][a-z0-9-]+\/web\/[a-zA-Z0-9_./-]+$/.test(url) || url.includes('..')) throw new Error('Invalid launch path');
    location.assign(origin + url);
  }
  function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; $('message').hidden = false; }
  function renderCatalog() {
    $('catalog').innerHTML = catalog.map(app => `<article class="app"><h2>${esc(app.name)}</h2><p>${esc(app.description)}</p><small>Version ${esc(app.version)} · browser-local documents</small><button data-install="${esc(app.id)}">${app.updateAvailable ? 'Update' : app.installedVersion ? 'Open' : 'Install'} ${esc(app.name)}</button></article>`).join('') || '<p class="empty">No apps in this collection yet.</p>';
    document.querySelectorAll('[data-install]').forEach(button => { button.onclick = async () => {
      const app = catalog.find(item => item.id === button.dataset.install);
      if (app.installedVersion && !app.updateAvailable) { launch(app.launchUrl); return; }
      button.disabled = true; button.textContent = app.updateAvailable ? 'Updating…' : 'Installing…';
      try {
        const localHeaders = await localMutationHeaders('app-store.install');
        const response = await fetch(origin + '/v1/app-store/' + encodeURIComponent(app.id) + '/install', {method:'POST',headers:{...(localHeaders || {'X-Shell-Install':token}),'X-Shell-Release':app.sha256}});
        if (!response.ok) throw new Error('Installation could not finish. Your existing apps were kept.');
        await refresh(); message(`${app.name} is installed. Open it here or from My apps.`);
      } catch (error) {
        try { await refresh(); } catch (_) { button.disabled = false; button.textContent = `Retry install ${app.name}`; }
        message(error.message, true);
      }
    }; });
  }
  async function refresh() {
    const { apps } = await json('/v1/apps', {cache:'no-store'});
    $('state').textContent = `${apps.length} installed app${apps.length === 1 ? '' : 's'}`;
    $('mine').innerHTML = apps.map(app => `<article class="app"><h2>${esc(app.name)}</h2><small>Version ${esc(app.version)}</small><button data-open="${esc(app.launchUrl)}">Open ${esc(app.name)}</button></article>`).join('') || '<p class="empty">No apps installed yet. Open Contained Evolution Apps to choose your first tool.</p>';
    document.querySelectorAll('[data-open]').forEach(button => { button.onclick = () => launch(button.dataset.open); });
    try {
      const result = await json('/v1/app-store', {cache:'no-store'});
      catalog = result.apps; token = result.installToken; renderCatalog();
    } catch (_) {
      $('catalog').innerHTML = '<p class="empty">The starter collection is unavailable in this build. Installed apps remain usable.</p>';
    }
  }
  async function refreshPairing() {
    const result = await json('/v1/pairing-management', {cache:'no-store'});
    const expiry = result.credentials && result.credentials.identity && result.credentials.identity.expiresAt;
    $('pairing-state').textContent = `${result.paired ? 'Paired' : 'Not paired'} · credentials ${result.credentials && result.credentials.identity ? result.credentials.identity.status : 'unavailable'}${expiry ? ` until ${new Date(expiry).toLocaleString()}` : ''}`;
  }
  async function refreshAll({ startup = false } = {}) {
    $('retry-local').hidden = true;
    const attempts = startup ? 8 : 1;
    let failure;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        await Promise.all([refresh(), refreshPairing()]);
        $('message').hidden = true;
        return;
      } catch (error) {
        failure = error;
        if (attempt + 1 < attempts) await wait(250 * (attempt + 1));
      }
    }
    $('state').textContent = 'Local services unavailable';
    $('pairing-state').textContent = 'Connection status unavailable.';
    message(failure && failure.message ? failure.message : 'Local services unavailable.', true);
    $('retry-local').hidden = false;
  }
  $('retry-local').onclick = () => refreshAll();
  async function pairingMutation(action) {
    const headers = await localMutationHeaders('pairing.manage');
    if (!headers) throw new Error('Open this page inside the SHELL desktop app to change connections.');
    const response = await fetch(origin + '/v1/pairing-management/' + action, {method:'POST',headers});
    const result = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(result.error || 'Connection change failed.');
    return result;
  }
  $('rotate-pairing').onclick = async () => {
    if (!confirm('Rotate all pairing credentials? Existing connected clients will stop until you give them the replacement credentials.')) return;
    try {
      const result = await pairingMutation('rotate');
      const blob = new Blob([JSON.stringify({generation:result.generation,expiresAt:result.expiresAt,...result.credentials},null,2)],{type:'application/json'});
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href=url; link.download=`shell-pairing-generation-${result.generation}.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),0);
      await refreshPairing(); message('Credentials rotated. A one-time replacement bundle was downloaded; store it securely.');
    } catch (error) { message(error.message,true); }
  };
  $('unpair').onclick = async () => {
    if (!confirm('Unpair this SHELL? Every existing remote credential will stop immediately.')) return;
    try { await pairingMutation('unpair'); await refreshPairing(); message('SHELL is unpaired. Existing remote credentials no longer work.'); }
    catch (error) { message(error.message,true); }
  };
  if (!invoke) {
    $('rotate-pairing').disabled=true; $('unpair').disabled=true;
    $('pairing-state').textContent='Open this page inside the SHELL desktop app to inspect or change connections.';
    refresh().catch(error => { $('state').textContent = 'Local services unavailable'; message(error.message, true); $('retry-local').hidden=false; });
  } else {
    refreshAll({startup:true});
  }
})();
