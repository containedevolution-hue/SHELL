(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CETypingCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORE_VERSION = 1;
  const MAX_SESSIONS = 200;

  function normalizeText(value) {
    return String(value == null ? '' : value)
      .replace(/\r\n?/g, '\n')
      .replace(/[\t\f\v]+/g, ' ')
      .trim();
  }

  function clampNumber(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function normalizeMapping(mapping) {
    const clean = {};
    if (!mapping || typeof mapping !== 'object') return clean;
    for (const [code, output] of Object.entries(mapping)) {
      const safeCode = String(code || '').trim();
      const safeOutput = String(output == null ? '' : output);
      if (safeCode && safeOutput.length === 1) clean[safeCode] = safeOutput;
    }
    return clean;
  }

  function normalizeProfile(profile, index) {
    if (!profile || typeof profile !== 'object') return null;
    const id = String(profile.id || `custom-${index}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const name = String(profile.name || `Custom ${index + 1}`).trim().slice(0, 48);
    if (!id || !name) return null;
    return {
      id,
      name,
      hand: ['two', 'left', 'right', 'custom'].includes(profile.hand) ? profile.hand : 'custom',
      passthrough: profile.passthrough !== false,
      mapping: normalizeMapping(profile.mapping),
    };
  }

  function createEmptyStore() {
    return { version: STORE_VERSION, sessions: [], profiles: [] };
  }

  function normalizeStore(value) {
    const clean = createEmptyStore();
    if (!value || typeof value !== 'object') return clean;
    if (Array.isArray(value.sessions)) {
      clean.sessions = value.sessions
        .filter((s) => s && typeof s === 'object' && Number.isFinite(Number(s.wpm)))
        .slice(0, MAX_SESSIONS)
        .map((s) => ({
          id: String(s.id || ''),
          completedAt: String(s.completedAt || ''),
          profileId: String(s.profileId || 'standard'),
          profileName: String(s.profileName || 'Two hands'),
          lessonType: String(s.lessonType || 'phrase'),
          wpm: clampNumber(s.wpm, 0, 0, 999),
          rawWpm: clampNumber(s.rawWpm, 0, 0, 999),
          accuracy: clampNumber(s.accuracy, 0, 0, 100),
          elapsedMs: clampNumber(s.elapsedMs, 0, 0, 86400000),
          totalErrors: clampNumber(s.totalErrors, 0, 0, 100000),
          corrections: clampNumber(s.corrections, 0, 0, 100000),
          characters: clampNumber(s.characters, 0, 0, 1000000),
          weakKeys: Array.isArray(s.weakKeys) ? s.weakKeys.slice(0, 8).map(String) : [],
        }));
    }
    if (Array.isArray(value.profiles)) {
      clean.profiles = value.profiles.map(normalizeProfile).filter(Boolean).slice(0, 24);
    }
    return clean;
  }

  function outputForKey(event, profile) {
    if (!event || event.ctrlKey || event.metaKey || event.altKey) return null;
    const mapping = normalizeMapping(profile && profile.mapping);
    if (event.code && Object.prototype.hasOwnProperty.call(mapping, event.code)) {
      return mapping[event.code];
    }
    if (profile && profile.passthrough === false) return null;
    if (event.key === 'Enter') return '\n';
    if (typeof event.key === 'string' && event.key.length === 1) return event.key;
    return null;
  }

  class TypingSession {
    constructor(target, now) {
      this.target = normalizeText(target);
      this.startedAt = null;
      this.endedAt = null;
      this.cursor = 0;
      this.entries = [];
      this.totalKeystrokes = 0;
      this.totalErrors = 0;
      this.corrections = 0;
      this.mistakes = {};
      this.createdAt = Number.isFinite(now) ? now : Date.now();
    }

    type(actual, code, now) {
      if (this.endedAt != null || this.cursor >= this.target.length) return this.snapshot(now);
      const value = String(actual == null ? '' : actual);
      if (value.length !== 1) return this.snapshot(now);
      const stamp = Number.isFinite(now) ? now : Date.now();
      if (this.startedAt == null) this.startedAt = stamp;
      const expected = this.target[this.cursor];
      const correct = value === expected;
      const entry = { expected, actual: value, correct, code: String(code || '') };
      this.entries.push(entry);
      this.cursor += 1;
      this.totalKeystrokes += 1;
      if (!correct) {
        this.totalErrors += 1;
        this.mistakes[expected] = (this.mistakes[expected] || 0) + 1;
      }
      if (this.cursor >= this.target.length) this.endedAt = stamp;
      return this.snapshot(stamp);
    }

    backspace(now) {
      if (this.endedAt != null || this.cursor <= 0) return this.snapshot(now);
      const removed = this.entries.pop();
      this.cursor -= 1;
      if (removed && !removed.correct) this.corrections += 1;
      return this.snapshot(now);
    }

    snapshot(now) {
      const stamp = Number.isFinite(now) ? now : Date.now();
      const finish = this.endedAt != null ? this.endedAt : stamp;
      const elapsedMs = this.startedAt == null ? 0 : Math.max(0, finish - this.startedAt);
      const minutes = Math.max(elapsedMs / 60000, 1 / 60);
      const correctOnPage = this.entries.reduce((sum, entry) => sum + (entry.correct ? 1 : 0), 0);
      const uncorrectedErrors = this.entries.length - correctOnPage;
      const accuracy = this.totalKeystrokes
        ? ((this.totalKeystrokes - this.totalErrors) / this.totalKeystrokes) * 100
        : 100;
      const weakKeys = Object.entries(this.mistakes)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([key, count]) => ({ key, count }));
      return {
        target: this.target,
        cursor: this.cursor,
        entries: this.entries.slice(),
        complete: this.endedAt != null,
        elapsedMs,
        wpm: (correctOnPage / 5) / minutes,
        rawWpm: (this.totalKeystrokes / 5) / minutes,
        accuracy,
        totalErrors: this.totalErrors,
        uncorrectedErrors,
        corrections: this.corrections,
        totalKeystrokes: this.totalKeystrokes,
        weakKeys,
      };
    }
  }

  function makeSessionRecord(session, details) {
    const snap = session.snapshot(details && details.now);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      completedAt: new Date().toISOString(),
      profileId: String((details && details.profileId) || 'standard'),
      profileName: String((details && details.profileName) || 'Two hands'),
      lessonType: String((details && details.lessonType) || 'phrase'),
      wpm: Math.round(snap.wpm * 10) / 10,
      rawWpm: Math.round(snap.rawWpm * 10) / 10,
      accuracy: Math.round(snap.accuracy * 10) / 10,
      elapsedMs: Math.round(snap.elapsedMs),
      totalErrors: snap.totalErrors,
      corrections: snap.corrections,
      characters: snap.target.length,
      weakKeys: snap.weakKeys.slice(0, 8).map((item) => item.key),
    };
  }

  function appendSession(store, record) {
    const clean = normalizeStore(store);
    clean.sessions.unshift(record);
    clean.sessions = clean.sessions.slice(0, MAX_SESSIONS);
    return clean;
  }

  function personalBest(sessions, profileId) {
    const eligible = (Array.isArray(sessions) ? sessions : [])
      .filter((session) => !profileId || session.profileId === profileId);
    if (!eligible.length) return null;
    return eligible.reduce((best, current) => current.wpm > best.wpm ? current : best);
  }

  return {
    STORE_VERSION,
    MAX_SESSIONS,
    TypingSession,
    appendSession,
    createEmptyStore,
    makeSessionRecord,
    normalizeMapping,
    normalizeProfile,
    normalizeStore,
    normalizeText,
    outputForKey,
    personalBest,
  };
});
