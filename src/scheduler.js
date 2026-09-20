'use strict';

const opencellid = require('./opencellid');

const SIX_HOURS = 6 * 60 * 60 * 1000;
let timer = null;

async function maybeRefresh(reason) {
  const token = process.env.OPENCELLID_API_KEY;
  const localFile = process.env.OPENCELLID_CSV_PATH;
  if (!token && !localFile) {
    console.warn(`[scheduler] OPENCELLID_API_KEY is not set; skipping refresh (${reason})`);
    return null;
  }
  const meta = opencellid.getMeta();
  if (!opencellid.isStale(meta)) {
    return meta;
  }
  try {
    const fresh = await opencellid.refresh({ token, file: localFile });
    console.log(`[scheduler] refreshed OpenCelliD cache (${reason}): ${fresh.count} cells`);
    return fresh;
  } catch (err) {
    console.error(`[scheduler] refresh failed (${reason}): ${err.message}`);
    return null;
  }
}

function start() {
  maybeRefresh('startup');
  if (timer) return timer;
  timer = setInterval(() => {
    maybeRefresh('interval');
  }, SIX_HOURS);
  timer.unref();
  return timer;
}

module.exports = { start, maybeRefresh };
