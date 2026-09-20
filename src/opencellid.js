'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const geo = require('./geo');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_DIR = path.join(DATA_DIR, 'opencellid');
const GEOJSON_PATH = path.join(DATA_DIR, 'dashboard_data_v6_kl.geojson');
const CELLS_PATH = path.join(CACHE_DIR, 'cells.json');
const META_PATH = path.join(CACHE_DIR, 'meta.json');
const SITES_PATH = path.join(CACHE_DIR, 'telecom_sites.geojson');

let cellsCache = { mtimeMs: null, value: null };
let metaCache = { mtimeMs: null, value: null };

function statMtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch (err) {
    return null;
  }
}

const FIELDS = ['radio', 'mnc', 'lac', 'cell', 'lon', 'lat', 'range', 'samples', 'lst', 'risk', 'dun'];
const THRESHOLDS = { low_max: 32, medium_max: 38 };
const MCC = 502;

function refreshIntervalDays() {
  const raw = Number(process.env.REFRESH_INTERVAL_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function riskFor(lst) {
  if (lst === null || lst === undefined || Number.isNaN(lst)) return null;
  if (lst < THRESHOLDS.low_max) return 'Low';
  if (lst < THRESHOLDS.medium_max) return 'Medium';
  return 'High';
}

function downloadUrl(token) {
  return `https://opencellid.org/ocid/downloads?token=${encodeURIComponent(token)}&type=mcc&file=${MCC}.csv.gz`;
}

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function loadGeojson() {
  return JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf8'));
}

function parseCell(row, index) {
  const lon = Number(row[6]);
  const lat = Number(row[7]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const dun = geo.locate(index, lon, lat);
  let lst = null;
  if (dun) {
    const parsed = Number.parseFloat(dun.lst_mean);
    if (Number.isFinite(parsed)) lst = round2(parsed);
  }
  return {
    row: [
      row[0],
      Number(row[2]),
      Number(row[3]),
      Number(row[4]),
      lon,
      lat,
      Number(row[8]),
      Number(row[9]),
      lst,
      riskFor(lst),
      dun ? dun.dun : null
    ],
    lon,
    lat,
    radio: row[0],
    range: Number(row[8]),
    lst
  };
}

function gunzipIfNeeded(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return zlib.gunzipSync(buffer).toString('utf8');
  }
  return buffer.toString('utf8');
}

async function download(token) {
  const response = await fetch(downloadUrl(token));
  if (!response.ok) {
    throw new Error(`OpenCelliD download failed with HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 2 || buffer[0] !== 0x1f || buffer[1] !== 0x8b) {
    let detail = 'token rejected or rate limited';
    try {
      const body = JSON.parse(buffer.toString('utf8'));
      if (body && body.message) detail = body.message;
    } catch (err) {
      detail = 'token rejected or rate limited';
    }
    throw new Error(`OpenCelliD returned a non-gzip response (${detail})`);
  }
  return zlib.gunzipSync(buffer).toString('utf8');
}

function readLocal(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`OpenCelliD CSV not found at ${filePath}`);
  }
  return gunzipIfNeeded(fs.readFileSync(filePath));
}

function buildSites(cells) {
  const features = [];
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [cell[4], cell[5]] },
      properties: {
        risk_tier: cell[9],
        predicted_lst_c: cell[8],
        radio: cell[0],
        range: cell[6]
      }
    });
  }
  return { type: 'FeatureCollection', features };
}

async function refresh(options = {}) {
  const token = options.token || process.env.OPENCELLID_API_KEY;
  const localFile = options.file || process.env.OPENCELLID_CSV_PATH;
  if (!token && !localFile) {
    throw new Error('OPENCELLID_API_KEY is not set and no OPENCELLID_CSV_PATH provided');
  }
  const geojson = loadGeojson();
  const index = geo.buildIndex(geojson);
  const bbox = geo.bounds(geojson);
  const csv = localFile ? readLocal(localFile) : await download(token);

  const cells = [];
  const lines = csv.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const row = line.split(',');
    if (row.length < 10) continue;
    const lon = Number(row[6]);
    const lat = Number(row[7]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
    const parsed = parseCell(row, index);
    if (parsed) cells.push(parsed.row);
  }

  const fetchedAt = new Date();
  const nextRefresh = new Date(fetchedAt.getTime() + refreshIntervalDays() * 24 * 60 * 60 * 1000);
  const meta = {
    source: 'OpenCelliD',
    mcc: MCC,
    url: 'https://opencellid.org',
    license: 'CC BY-SA 4.0',
    attribution: 'Cell data © OpenCelliD (CC BY-SA 4.0)',
    fetched_at: fetchedAt.toISOString(),
    next_refresh_at: nextRefresh.toISOString(),
    count: cells.length,
    bbox,
    fields: FIELDS,
    thresholds: THRESHOLDS
  };

  ensureCacheDir();
  fs.writeFileSync(CELLS_PATH, JSON.stringify({ meta, fields: FIELDS, cells }));
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
  fs.writeFileSync(SITES_PATH, JSON.stringify(buildSites(cells)));
  cellsCache = { mtimeMs: null, value: null };
  metaCache = { mtimeMs: null, value: null };
  return meta;
}

function getCells() {
  const mtimeMs = statMtimeMs(CELLS_PATH);
  if (mtimeMs !== null && cellsCache.value !== null && cellsCache.mtimeMs === mtimeMs) {
    return cellsCache.value;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(CELLS_PATH, 'utf8'));
    let value;
    if (!parsed || !Array.isArray(parsed.cells)) {
      value = { meta: null, fields: FIELDS, cells: [] };
    } else {
      value = { meta: parsed.meta || null, fields: parsed.fields || FIELDS, cells: parsed.cells };
    }
    cellsCache = { mtimeMs, value };
    return value;
  } catch (err) {
    return { meta: null, fields: FIELDS, cells: [] };
  }
}

function getMeta() {
  const mtimeMs = statMtimeMs(META_PATH);
  if (mtimeMs !== null && metaCache.value !== null && metaCache.mtimeMs === mtimeMs) {
    return metaCache.value;
  }
  try {
    const value = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
    metaCache = { mtimeMs, value };
    return value;
  } catch (err) {
    return null;
  }
}

function isStale(meta) {
  if (!meta || !meta.next_refresh_at) return true;
  const next = Date.parse(meta.next_refresh_at);
  if (Number.isNaN(next)) return true;
  return next <= Date.now();
}

module.exports = {
  refresh,
  getCells,
  readCache: getCells,
  getMeta,
  isStale,
  FIELDS,
  THRESHOLDS,
  MCC,
  CELLS_PATH,
  META_PATH,
  SITES_PATH
};
