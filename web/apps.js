(function () {
  'use strict';
  const origin = 'http://127.0.0.1:5984';
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let catalog = [], token = null;
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
    $('catalog').innerHTML = catalog.map(app => `<article class="app"><h2>${esc(app.name)}</h2><p>${esc(app.description)}</p><small>Version ${esc(app.version)} · browser-local documents</small><button data-install="${esc(app.id)}">${app.installedVersion ? 'Open' : 'Install'} ${esc(app.name)}</button></article>`).join('') || '<p class="empty">No apps in this collection yet.</p>';
    document.querySelectorAll('[data-install]').forEach(button => { button.onclick = async () => {
      const app = catalog.find(item => item.id === button.dataset.install);
      if (app.installedVersion) { launch(app.launchUrl); return; }
      button.disabled = true; button.textContent = 'Installing…';
      try {
        const response = await fetch(origin + '/v1/app-store/' + encodeURIComponent(app.id) + '/install', {method:'POST',headers:{'X-Shell-Install':token}});
        if (!response.ok) throw new Error('Installation could not finish. Your existing apps were kept.');
        await refresh(); message(`${app.name} is installed. Open it here or from My apps.`);
      } catch (error) { button.disabled = false; button.textContent = `Retry install ${app.name}`; message(error.message, true); }
    }; });
  }
  async function refresh() {
    const installedResponse = await fetch(origin + '/v1/apps', {cache:'no-store'});
    if (!installedResponse.ok) throw new Error('Start SHELL’s local services to open your apps.');
    const { apps } = await installedResponse.json();
    $('state').textContent = `${apps.length} installed app${apps.length === 1 ? '' : 's'}`;
    $('mine').innerHTML = apps.map(app => `<article class="app"><h2>${esc(app.name)}</h2><small>Version ${esc(app.version)}</small><button data-open="${esc(app.launchUrl)}">Open ${esc(app.name)}</button></article>`).join('') || '<p class="empty">No apps installed yet. Open Contained Evolution Apps to choose your first tool.</p>';
    document.querySelectorAll('[data-open]').forEach(button => { button.onclick = () => launch(button.dataset.open); });
    const storeResponse = await fetch(origin + '/v1/app-store', {cache:'no-store'});
    if (!storeResponse.ok) { $('catalog').innerHTML = '<p class="empty">The starter collection is unavailable in this build. Installed apps remain usable.</p>'; return; }
    const result = await storeResponse.json(); catalog = result.apps; token = result.installToken; renderCatalog();
  }
  refresh().catch(error => { $('state').textContent = 'Local services unavailable'; message(error.message, true); });
})();
