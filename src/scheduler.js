'use strict';

const opencellid = require('./opencellid');
const dashboardData = require('./dashboard-data');

const SIX_HOURS = 6 * 60 * 60 * 1000;
let timer = null;

function ensureDashboardData() {
  if (dashboardData.exists()) return;
  try {
    const built = dashboardData.build();
    console.log(`[scheduler] dashboard data built: ${built.sites.toLocaleString()} sites`);
  } catch (err) {
    console.warn(`[scheduler] dashboard data build skipped: ${err.message}`);
  }
}

async function maybeRefresh(reason) {
  const token = process.env.OPENCELLID_API_KEY;
  const localFile = process.env.OPENCELLID_CSV_PATH;
  if (!token && !localFile) {
    console.warn(`[scheduler] OPENCELLID_API_KEY is not set; skipping refresh (${reason})`);
    ensureDashboardData();
    return null;
  }
  const meta = opencellid.getMeta();
  if (!opencellid.isStale(meta)) {
    ensureDashboardData();
    return meta;
  }
  try {
    const fresh = await opencellid.refresh({ token, file: localFile });
    console.log(`[scheduler] refreshed OpenCelliD cache (${reason}): ${fresh.count} cells`);
    ensureDashboardData();
    return fresh;
  } catch (err) {
    console.error(`[scheduler] refresh failed (${reason}): ${err.message}`);
    ensureDashboardData();
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
