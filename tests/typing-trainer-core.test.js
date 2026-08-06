const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TypingSession,
  appendSession,
  normalizeStore,
  outputForKey,
  personalBest,
} = require('../web/typing-trainer-core.js');

test('a perfect five-character minute is one WPM at 100% accuracy', () => {
  const session = new TypingSession('hello', 0);
  session.type('h', 'KeyH', 0);
  session.type('e', 'KeyE', 15000);
  session.type('l', 'KeyL', 30000);
  session.type('l', 'KeyL', 45000);
  const result = session.type('o', 'KeyO', 60000);
  assert.equal(result.complete, true);
  assert.equal(result.wpm, 1);
  assert.equal(result.accuracy, 100);
});

test('the first second uses a measurement floor instead of an explosive WPM spike', () => {
  const session = new TypingSession('hello', 0);
  session.type('h', 'KeyH', 0);
  session.type('e', 'KeyE', 20);
  session.type('l', 'KeyL', 40);
  session.type('l', 'KeyL', 60);
  const result = session.type('o', 'KeyO', 80);
  assert.equal(result.wpm, 60);
});

test('corrected errors remain in accuracy and weak-key history', () => {
  const session = new TypingSession('ab', 0);
  session.type('x', 'KeyX', 0);
  session.backspace(100);
  session.type('a', 'KeyA', 200);
  const result = session.type('b', 'KeyB', 1000);
  assert.equal(result.totalErrors, 1);
  assert.equal(result.corrections, 1);
  assert.equal(result.uncorrectedErrors, 0);
  assert.equal(Math.round(result.accuracy * 10) / 10, 66.7);
  assert.deepEqual(result.weakKeys, [{ key: 'a', count: 1 }]);
});

test('custom physical mappings override normal key output without changing the OS', () => {
  const profile = { passthrough: true, mapping: { Numpad1: 'a' } };
  assert.equal(outputForKey({ code: 'Numpad1', key: '1' }, profile), 'a');
  assert.equal(outputForKey({ code: 'KeyB', key: 'b' }, profile), 'b');
  assert.equal(outputForKey({ code: 'KeyB', key: 'b' }, { passthrough: false, mapping: {} }), null);
});

test('malformed stored progress is constrained and recoverable', () => {
  const clean = normalizeStore({
    sessions: [{ wpm: 55, accuracy: 101, weakKeys: ['a'] }, { nope: true }],
    profiles: [{ id: '../bad', name: ' Pad ', mapping: { Numpad1: 'ab', Numpad2: 'z' } }],
  });
  assert.equal(clean.sessions.length, 1);
  assert.equal(clean.sessions[0].accuracy, 100);
  assert.equal(clean.profiles[0].id, 'bad');
  assert.deepEqual(clean.profiles[0].mapping, { Numpad2: 'z' });
});

test('history is newest first and personal best can be profile-specific', () => {
  let store = normalizeStore({ sessions: [] });
  store = appendSession(store, { id: 'one', profileId: 'standard', wpm: 20 });
  store = appendSession(store, { id: 'two', profileId: 'left', wpm: 30 });
  store = appendSession(store, { id: 'three', profileId: 'standard', wpm: 25 });
  assert.deepEqual(store.sessions.map((s) => s.id), ['three', 'two', 'one']);
  assert.equal(personalBest(store.sessions, 'standard').wpm, 25);
  assert.equal(personalBest(store.sessions).wpm, 30);
});
