(function () {
  'use strict';

  const Core = window.CETypingCore;
  const STORAGE_KEY = 'ce.localhub.typing-trainer.v1';
  const BUILT_INS = [
    { id: 'standard', name: 'Two hands · standard QWERTY', hand: 'two', passthrough: true, mapping: {} },
    { id: 'left', name: 'Left hand only · standard QWERTY', hand: 'left', passthrough: true, mapping: {} },
    { id: 'right', name: 'Right hand only · standard QWERTY', hand: 'right', passthrough: true, mapping: {} },
  ];
  const LESSONS = {
    phrase: [
      'steady hands, clear thoughts',
      'accuracy becomes speed',
      'small steps build strong habits',
      'practice with patience',
      'keep your shoulders relaxed',
      'smooth rhythm over rushed motion',
      'focus on the next key',
      'learn the pattern, then move faster',
      'quiet confidence grows here',
      'one clean line at a time',
      'breathe, reset, and continue',
      'good form makes speed repeatable',
    ],
    sentence: [
      'Speed grows naturally when each keystroke becomes calm and accurate.',
      'A short daily practice can build more skill than one exhausting session.',
      'Keep your eyes on the sentence and let your hands learn the route.',
      'Mistakes are useful signals that show exactly where to practice next.',
      'Relax your grip, sit comfortably, and return your fingers to familiar keys.',
      'A steady rhythm makes long passages easier to type without losing control.',
      'The goal is not to rush; the goal is to make good movement automatic.',
      'Custom layouts become easier when the same physical key keeps one job.',
    ],
    paragraph: [
      'Typing faster begins with accuracy. Work at a pace that lets you notice each key, then allow repetition to make the movement smaller and smoother. Speed is the result of reliable motion, not a reason to tense your hands.',
      'When a difficult letter appears, pause long enough to learn its location. A corrected mistake still counts as useful practice because it tells the trainer which keys deserve more attention in the next session.',
      'One-handed typing needs its own rhythm. Keep the active hand relaxed, move from the arm when reaching across the keyboard, and use a custom profile when a keypad places important characters under different physical buttons.',
      'Consistency beats intensity. Ten focused minutes on most days will usually teach your hands more than a long session that leaves you tired, frustrated, or careless about accuracy.',
      'Good typing is quiet and economical. Press only as hard as the keyboard requires, release each key cleanly, and return to a comfortable resting position before the next reach.',
    ],
  };
  const KEY_ROWS = [
    [['`', 'Backquote'], ['1', 'Digit1'], ['2', 'Digit2'], ['3', 'Digit3'], ['4', 'Digit4'], ['5', 'Digit5'], ['6', 'Digit6'], ['7', 'Digit7'], ['8', 'Digit8'], ['9', 'Digit9'], ['0', 'Digit0'], ['-', 'Minus'], ['=', 'Equal'], ['⌫', 'Backspace', 'wide']],
    [['Tab', 'Tab', 'wide'], ['Q', 'KeyQ'], ['W', 'KeyW'], ['E', 'KeyE'], ['R', 'KeyR'], ['T', 'KeyT'], ['Y', 'KeyY'], ['U', 'KeyU'], ['I', 'KeyI'], ['O', 'KeyO'], ['P', 'KeyP'], ['[', 'BracketLeft'], [']', 'BracketRight'], ['\\', 'Backslash']],
    [['Caps', 'CapsLock', 'wide'], ['A', 'KeyA'], ['S', 'KeyS'], ['D', 'KeyD'], ['F', 'KeyF'], ['G', 'KeyG'], ['H', 'KeyH'], ['J', 'KeyJ'], ['K', 'KeyK'], ['L', 'KeyL'], [';', 'Semicolon'], ["'", 'Quote'], ['Enter', 'Enter', 'wide']],
    [['Shift', 'ShiftLeft', 'wide'], ['Z', 'KeyZ'], ['X', 'KeyX'], ['C', 'KeyC'], ['V', 'KeyV'], ['B', 'KeyB'], ['N', 'KeyN'], ['M', 'KeyM'], [',', 'Comma'], ['.', 'Period'], ['/', 'Slash'], ['Shift', 'ShiftRight', 'wide']],
    [['Space', 'Space', 'space']],
  ];
  const HELP = {
    two: 'Normal QWERTY practice using both hands. Build accuracy before chasing speed.',
    left: 'Type the full drill with your left hand. Slow down on long reaches and stay relaxed.',
    right: 'Type the full drill with your right hand. Slow down on long reaches and stay relaxed.',
    custom: 'Mapped physical keys override their normal output inside this trainer only.',
  };

  const $ = (id) => document.getElementById(id);
  let store = loadStore();
  let currentSession = null;
  let currentText = '';
  let currentLessonIndex = -1;
  let recorded = false;
  let captureMode = false;
  let capturedCode = '';
  let editingProfileId = null;
  let editMapping = {};
  let timer = null;

  function loadStore() {
    try { return Core.normalizeStore(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); }
    catch (_) { return Core.createEmptyStore(); }
  }

  function saveStore() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
    catch (_) { announce('Progress could not be saved on this computer.'); }
  }

  function announce(message) { $('liveStatus').textContent = message; }
  function profiles() { return BUILT_INS.concat(store.profiles); }
  function currentProfile() {
    return profiles().find((profile) => profile.id === $('profileSelect').value) || BUILT_INS[0];
  }

  function renderProfileOptions(selectedId) {
    const select = $('profileSelect');
    select.replaceChildren();
    for (const profile of profiles()) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      select.appendChild(option);
    }
    select.value = profiles().some((profile) => profile.id === selectedId) ? selectedId : 'standard';
    updateProfileUI();
  }

  function updateProfileUI() {
    const profile = currentProfile();
    $('profileHelp').textContent = HELP[profile.hand] || HELP.custom;
    $('modeLabel').textContent = profile.name;
    $('handHint').textContent = profile.hand === 'two'
      ? 'Blue = left-hand zone · purple = right-hand zone'
      : profile.hand === 'left' ? 'Use your left hand for the full layout'
        : profile.hand === 'right' ? 'Use your right hand for the full layout'
          : `${Object.keys(profile.mapping || {}).length} physical key mapping(s)`;
    $('editProfile').hidden = BUILT_INS.some((item) => item.id === profile.id);
    updateKeyboard();
    renderProgress();
  }

  function buildKeyboard() {
    const keyboard = $('keyboard');
    for (const row of KEY_ROWS) {
      const rowEl = document.createElement('div');
      rowEl.className = 'key-row';
      for (const [label, code, size] of row) {
        const key = document.createElement('div');
        key.className = `key ${zoneForCode(code)}${size ? ` ${size}` : ''}`;
        key.dataset.code = code;
        key.textContent = label;
        rowEl.appendChild(key);
      }
      keyboard.appendChild(rowEl);
    }
  }

  function zoneForCode(code) {
    if (/^(Key[QWERTASDFGZXCVB]|Digit[12345]|Backquote|Tab|CapsLock|ShiftLeft)$/.test(code)) return 'left-zone';
    if (/^(Key[YUIOPHJKLMN]|KeyM|Digit[67890]|Minus|Equal|Bracket|Backslash|Semicolon|Quote|Comma|Period|Slash|Enter|ShiftRight)/.test(code)) return 'right-zone';
    return '';
  }

  function codeForCharacter(character, profile) {
    for (const [code, output] of Object.entries(profile.mapping || {})) {
      if (output === character) return code;
    }
    if (/^[a-zA-Z]$/.test(character)) return `Key${character.toUpperCase()}`;
    if (/^[0-9]$/.test(character)) return `Digit${character}`;
    return {
      ' ': 'Space', '\n': 'Enter', '`': 'Backquote', '-': 'Minus', '=': 'Equal',
      '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', ';': 'Semicolon',
      "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash',
    }[character] || '';
  }

  function updateKeyboard(pressedCode) {
    document.querySelectorAll('.key').forEach((key) => key.classList.remove('next', 'pressed'));
    if (pressedCode) {
      const pressed = document.querySelector(`.key[data-code="${CSS.escape(pressedCode)}"]`);
      if (pressed) {
        pressed.classList.add('pressed');
        setTimeout(() => pressed.classList.remove('pressed'), 140);
      }
    }
    if (!currentSession) return;
    const snap = currentSession.snapshot();
    const expected = snap.target[snap.cursor];
    const code = codeForCharacter(expected, currentProfile());
    if (!code) return;
    const next = document.querySelector(`.key[data-code="${CSS.escape(code)}"]`);
    if (next) next.classList.add('next');
  }

  function pickLesson(type) {
    const choices = LESSONS[type] || [];
    if (!choices.length) return '';
    let index = Math.floor(Math.random() * choices.length);
    if (choices.length > 1 && index === currentLessonIndex) index = (index + 1) % choices.length;
    currentLessonIndex = index;
    return choices[index];
  }

  function startDrill(useSameText) {
    const type = $('lessonType').value;
    const text = useSameText ? currentText
      : type === 'custom' ? Core.normalizeText($('customText').value) : pickLesson(type);
    if (!text || (type === 'custom' && text.length < 5)) {
      currentSession = null;
      currentText = '';
      $('practiceText').className = 'practice-text empty';
      $('practiceText').textContent = text
        ? 'Use at least 5 characters so the speed result has a meaningful sample.'
        : 'Add some custom practice text in the setup panel, then start the drill.';
      $('customText').focus();
      updateAll();
      return;
    }
    currentText = text;
    currentSession = new Core.TypingSession(text);
    recorded = false;
    $('practiceText').className = 'practice-text';
    $('practiceTitle').textContent = type === 'custom' ? 'Your custom drill' : `${type[0].toUpperCase()}${type.slice(1)} drill`;
    updateAll();
    $('practiceText').focus();
    announce(`New ${type} drill ready. ${text.length} characters.`);
  }

  function renderTarget() {
    const host = $('practiceText');
    if (!currentSession) return;
    const snap = currentSession.snapshot();
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < snap.target.length; i += 1) {
      const span = document.createElement('span');
      span.className = 'char';
      if (i < snap.entries.length) span.classList.add(snap.entries[i].correct ? 'correct' : 'incorrect');
      if (i === snap.cursor && !snap.complete) span.classList.add('current');
      const char = snap.target[i];
      span.textContent = char === '\n' ? '↵' : char === ' ' ? '\u00a0' : char;
      fragment.appendChild(span);
      if (char === '\n') fragment.appendChild(document.createElement('br'));
    }
    host.replaceChildren(fragment);
    $('progress').textContent = `${snap.cursor} / ${snap.target.length}`;
    const next = snap.target[snap.cursor];
    $('typingHint').textContent = snap.complete ? 'Completed — results saved locally.'
      : currentSession.startedAt == null ? 'Start typing. The timer begins on your first key.'
        : `Next: ${displayCharacter(next)} · Backspace corrects the previous character.`;
  }

  function displayCharacter(character) {
    if (character === ' ') return 'Space';
    if (character === '\n') return 'Enter';
    return character || '—';
  }

  function renderMetrics() {
    const snap = currentSession ? currentSession.snapshot() : null;
    $('wpm').textContent = snap ? Math.round(snap.wpm) : '0';
    $('accuracy').textContent = snap ? `${Math.round(snap.accuracy)}%` : '100%';
    $('errors').textContent = snap ? String(snap.totalErrors) : '0';
    $('elapsed').textContent = formatDuration(snap ? snap.elapsedMs : 0);
  }

  function formatDuration(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function updateAll() {
    renderTarget();
    renderMetrics();
    updateProfileUI();
  }

  function handlePracticeKey(event) {
    if (!currentSession || currentSession.snapshot().complete) return;
    if (event.key === 'Backspace') {
      event.preventDefault();
      currentSession.backspace();
      updateAll();
      return;
    }
    const output = Core.outputForKey(event, currentProfile());
    if (output == null) return;
    event.preventDefault();
    const snap = currentSession.type(output, event.code);
    renderTarget();
    renderMetrics();
    updateKeyboard(event.code);
    if (snap.complete) completeDrill();
  }

  function completeDrill() {
    if (recorded || !currentSession) return;
    recorded = true;
    const profile = currentProfile();
    const record = Core.makeSessionRecord(currentSession, {
      profileId: profile.id,
      profileName: profile.name,
      lessonType: $('lessonType').value,
    });
    store = Core.appendSession(store, record);
    saveStore();
    renderProgress();
    $('completeStats').innerHTML = [
      [record.wpm, 'WPM'], [`${record.accuracy}%`, 'accuracy'], [record.totalErrors, 'mistakes'], [record.corrections, 'corrected'],
    ].map(([value, label]) => `<div><strong>${value}</strong><small>${label}</small></div>`).join('');
    $('completeAdvice').textContent = adviceFor(record);
    if (!$('completeDialog').open) $('completeDialog').showModal();
    announce(`Drill complete. ${record.wpm} words per minute at ${record.accuracy} percent accuracy.`);
  }

  function adviceFor(record) {
    const weak = record.weakKeys.map(displayCharacter).join(', ');
    if (record.accuracy < 90) return `Slow down on the next run. Accuracy is the shortest path to repeatable speed${weak ? `, especially around ${weak}` : ''}.`;
    if (record.accuracy < 97) return `Your rhythm is working. Keep this pace and clean up ${weak || 'the few remaining misses'} before pushing faster.`;
    if (weak) return `Strong accuracy. Keep the same relaxed form and give ${weak} a little extra attention.`;
    return 'Clean run. Repeat it once for consistency, then try a longer drill.';
  }

  function renderProgress() {
    const sessions = store.sessions;
    const profile = currentProfile();
    const best = Core.personalBest(sessions, profile.id);
    const recent = sessions.slice(0, 10);
    const average = recent.length ? recent.reduce((sum, item) => sum + item.wpm, 0) / recent.length : 0;
    const accuracy = recent.length ? recent.reduce((sum, item) => sum + item.accuracy, 0) / recent.length : 0;
    $('progressSummary').innerHTML = `
      <div><strong>${best ? best.wpm : '—'}</strong><span>best WPM in this profile</span></div>
      <div><strong>${recent.length ? average.toFixed(1) : '—'}</strong><span>recent average WPM</span></div>
      <div><strong>${recent.length ? `${accuracy.toFixed(1)}%` : '—'}</strong><span>recent accuracy</span></div>`;

    const weakCounts = new Map();
    for (const session of recent) {
      for (const key of session.weakKeys || []) weakCounts.set(key, (weakCounts.get(key) || 0) + 1);
    }
    const weak = [...weakCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([key]) => displayCharacter(key));
    $('improvement').textContent = !sessions.length
      ? 'Finish one drill to establish your baseline. Accuracy matters more than the first WPM number.'
      : weak.length ? `Practice signal: your recent sessions most often flagged ${weak.join(', ')}.`
        : 'Your recent sessions show no repeating weak key. Try a longer drill for a stronger signal.';
    renderHistory();
  }

  function renderHistory() {
    const host = $('history');
    host.replaceChildren();
    if (!store.sessions.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-history';
      empty.textContent = 'No completed sessions yet.';
      host.appendChild(empty);
      return;
    }
    for (const session of store.sessions.slice(0, 8)) {
      const row = document.createElement('div');
      row.className = 'history-row';
      const title = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = session.profileName;
      const small = document.createElement('small');
      const date = new Date(session.completedAt);
      small.textContent = `${session.lessonType} · ${Number.isNaN(date.getTime()) ? 'saved session' : date.toLocaleDateString()}`;
      title.append(strong, small);
      const speed = document.createElement('span');
      speed.textContent = `${session.wpm} WPM`;
      const acc = document.createElement('span');
      acc.textContent = `${session.accuracy}%`;
      row.append(title, speed, acc);
      host.appendChild(row);
    }
  }

  function openProfileEditor(id) {
    const existing = store.profiles.find((profile) => profile.id === id);
    editingProfileId = existing ? existing.id : null;
    editMapping = { ...(existing ? existing.mapping : {}) };
    capturedCode = '';
    captureMode = false;
    $('profileName').value = existing ? existing.name : '';
    $('profilePassthrough').checked = existing ? existing.passthrough : true;
    $('capturedCode').textContent = 'No key captured';
    $('captureKey').textContent = 'Capture a physical key';
    $('mappingOutput').value = '';
    $('deleteProfile').hidden = !existing;
    renderMappingList();
    $('profileDialog').showModal();
    $('profileName').focus();
  }

  function renderMappingList() {
    const host = $('mappingList');
    host.replaceChildren();
    const entries = Object.entries(editMapping);
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-history';
      empty.textContent = 'No remapped keys yet. Unmapped keys follow the passthrough setting.';
      host.appendChild(empty);
      return;
    }
    for (const [code, output] of entries) {
      const row = document.createElement('div');
      row.className = 'mapping-row';
      const codeEl = document.createElement('code');
      codeEl.textContent = code;
      const outputEl = document.createElement('span');
      outputEl.textContent = `→ ${displayCharacter(output)}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => { delete editMapping[code]; renderMappingList(); });
      row.append(codeEl, outputEl, remove);
      host.appendChild(row);
    }
  }

  function addCapturedMapping(output) {
    if (!capturedCode) { announce('Capture a physical key first.'); return; }
    if (String(output).length !== 1) { announce('Choose one output character.'); return; }
    editMapping[capturedCode] = output;
    capturedCode = '';
    $('capturedCode').textContent = 'No key captured';
    $('mappingOutput').value = '';
    renderMappingList();
    $('captureKey').focus();
  }

  function saveProfile() {
    const name = $('profileName').value.trim();
    if (!name) { $('profileName').focus(); announce('Give the profile a name.'); return; }
    const id = editingProfileId || `custom-${Date.now().toString(36)}`;
    const profile = Core.normalizeProfile({
      id, name, hand: 'custom', passthrough: $('profilePassthrough').checked, mapping: editMapping,
    }, store.profiles.length);
    if (!profile) return;
    const index = store.profiles.findIndex((item) => item.id === id);
    if (index >= 0) store.profiles[index] = profile;
    else store.profiles.push(profile);
    store = Core.normalizeStore(store);
    saveStore();
    $('profileDialog').close();
    renderProfileOptions(profile.id);
    startDrill(true);
    announce(`${profile.name} saved.`);
  }

  function deleteProfile() {
    const profile = store.profiles.find((item) => item.id === editingProfileId);
    if (!profile || !confirm(`Delete the custom profile “${profile.name}”? Saved session history will remain.`)) return;
    store.profiles = store.profiles.filter((item) => item.id !== editingProfileId);
    saveStore();
    $('profileDialog').close();
    renderProfileOptions('standard');
    startDrill(true);
    announce('Custom profile deleted.');
  }

  function bindEvents() {
    $('practiceText').addEventListener('keydown', handlePracticeKey);
    $('newDrill').addEventListener('click', () => startDrill(false));
    $('restart').addEventListener('click', () => startDrill(true));
    $('skip').addEventListener('click', () => startDrill(false));
    $('lessonType').addEventListener('change', () => {
      $('customWrap').hidden = $('lessonType').value !== 'custom';
      startDrill(false);
    });
    $('profileSelect').addEventListener('change', () => { updateProfileUI(); startDrill(true); });
    $('newProfile').addEventListener('click', () => openProfileEditor(null));
    $('editProfile').addEventListener('click', () => openProfileEditor(currentProfile().id));
    $('resetProgress').addEventListener('click', () => {
      if (!store.sessions.length || !confirm('Reset all Typing Trainer progress on this computer? Custom keyboard profiles will be kept.')) return;
      store.sessions = [];
      saveStore();
      renderProgress();
      announce('Typing progress reset.');
    });
    $('retryComplete').addEventListener('click', () => { $('completeDialog').close(); startDrill(true); });
    $('nextComplete').addEventListener('click', () => { $('completeDialog').close(); startDrill(false); });
    $('captureKey').addEventListener('click', () => {
      captureMode = true;
      capturedCode = '';
      $('capturedCode').textContent = 'Press a physical key now…';
      $('captureKey').textContent = 'Listening…';
    });
    $('addMapping').addEventListener('click', () => addCapturedMapping($('mappingOutput').value));
    $('addSpace').addEventListener('click', () => addCapturedMapping(' '));
    $('addEnter').addEventListener('click', () => addCapturedMapping('\n'));
    $('saveProfile').addEventListener('click', saveProfile);
    $('cancelProfile').addEventListener('click', () => $('profileDialog').close());
    $('deleteProfile').addEventListener('click', deleteProfile);
    document.addEventListener('keydown', (event) => {
      if (!captureMode || !$('profileDialog').open) return;
      event.preventDefault();
      event.stopPropagation();
      if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(event.code)) return;
      captureMode = false;
      capturedCode = event.code || event.key;
      $('capturedCode').textContent = capturedCode;
      $('captureKey').textContent = 'Capture a physical key';
      $('mappingOutput').focus();
    }, true);
    $('profileDialog').addEventListener('close', () => { captureMode = false; });
  }

  function init() {
    buildKeyboard();
    renderProfileOptions('standard');
    bindEvents();
    startDrill(false);
    timer = setInterval(() => {
      if (currentSession && currentSession.startedAt != null && !currentSession.snapshot().complete) renderMetrics();
    }, 250);
    window.addEventListener('beforeunload', () => clearInterval(timer));
  }

  init();
})();
