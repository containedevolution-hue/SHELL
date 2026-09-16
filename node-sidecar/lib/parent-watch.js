'use strict';

const CHECK_MS = 2000;

function parentIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function start(onGone) {
  const raw = Number(process.env.LOCALHUB_PARENT_PID);
  if (!Number.isInteger(raw) || raw <= 0) return null;
  const timer = setInterval(() => {
    if (parentIsAlive(raw)) return;
    clearInterval(timer);
    onGone(raw);
  }, CHECK_MS);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { start, parentIsAlive, CHECK_MS };
