'use strict';

require('./src/env');

const fs = require('fs');
const path = require('path');
const express = require('express');
const geo = require('./src/geo');
const opencellid = require('./src/opencellid');
const dashboardData = require('./src/dashboard-data');
const scheduler = require('./src/scheduler');

const app = express();
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const GEOJSON_PATH = path.join(DATA_DIR, 'dashboard_data_v3.geojson');
const CSV_PATH = path.join(DATA_DIR, 'uhvi_dun_v3.csv');
const PNG_PATH = '/data/UHVI_Klang_Valley_v2_2.png';
const PNG_BOUNDS = [101.15, 2.65, 102.02, 3.48];

let geojsonCache = null;

function loadGeojson() {
  if (!geojsonCache) {
    geojsonCache = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf8'));
  }
  return geojsonCache;
}

app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use('/data', express.static(DATA_DIR));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/meta', (req, res) => {
  try {
    const geojson = loadGeojson();
    res.json({
      dataset: {
        name: 'dashboard_data_v3',
        feature_count: geojson.features.length,
        bounds: geo.bounds(geojson)
      },
      png: {
        path: PNG_PATH,
        bounds: PNG_BOUNDS,
        note: 'approximate reference overlay'
      },
      cells: opencellid.getMeta() || null,
      thresholds: opencellid.THRESHOLDS,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(err && err.code === 'ENOENT' ? 404 : 500).json({ error: err.message });
  }
});

app.get('/api/geojson', (req, res) => {
  try {
    res.json(loadGeojson());
  } catch (err) {
    res.status(err && err.code === 'ENOENT' ? 404 : 500).json({ error: err.message });
  }
});

app.get('/api/csv', (req, res) => {
  try {
    const csv = fs.readFileSync(CSV_PATH, 'utf8');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.send(csv);
  } catch (err) {
    res.status(err && err.code === 'ENOENT' ? 404 : 500).json({ error: err.message });
  }
});

app.get('/api/cells', (req, res) => {
  res.json(opencellid.getCells());
});

app.get('/api/cells/meta', (req, res) => {
  res.json(opencellid.getMeta() || {});
});

app.post('/api/cells/refresh', async (req, res) => {
  try {
    const meta = await opencellid.refresh();
    const built = dashboardData.build();
    res.json({ ok: true, count: meta.count, fetched_at: meta.fetched_at, sites: built.sites, grid_cells: built.gridCells });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Navi Heat Dashboard listening on http://localhost:${port}`);
  scheduler.start();
});

module.exports = app;
