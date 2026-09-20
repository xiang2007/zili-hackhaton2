'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const geo = require('./geo');
const opencellid = require('./opencellid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const GEOJSON_PATH = path.join(DATA_DIR, 'dashboard_data_v3.geojson');
const SITES_PATH = path.join(DATA_DIR, 'sites.json');
const GRID_PATH = path.join(DATA_DIR, 'heat_exposure_grid.geojson');
const SURFACE_PATH = path.join(DATA_DIR, 'surface_matrix.json');
const SUMMARY_PATH = path.join(DATA_DIR, 'summary.json');
const CSV_PATH = path.join(DATA_DIR, 'telecom_heat_risk.csv');

const RISK_NAME = ['Low', 'Medium', 'High'];
const GRID_SIZE = 0.01;
const SURFACE_WIDTH = 64;
const SURFACE_HEIGHT = 52;
const SURFACE_SIGMA = 0.018;

function riskCode(value) {
  if (value < 32) return 0;
  if (value < 38) return 1;
  return 2;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildReferences(geojson, index) {
  const refs = [];
  const byDun = new Map();
  for (const feature of geojson.features) {
    const props = feature.properties;
    const lst = Number.parseFloat(props.klang_valley_uhvi_final__LSTbasemean);
    const delta = Number.parseFloat(props.green__deltaGreenmean);
    const center = geo.centroid(props, index);
    if (!center || !Number.isFinite(lst)) continue;
    const ref = {
      lon: center[0],
      lat: center[1],
      lst,
      delta: Number.isFinite(delta) ? delta : 0,
      dun: props.dun
    };
    refs.push(ref);
    if (props.dun) byDun.set(props.dun, ref);
  }
  return { refs, byDun };
}

function nearestReference(refs, lon, lat) {
  let best = null;
  let bestDistance = Infinity;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (const ref of refs) {
    const dx = (lon - ref.lon) * cosLat;
    const dy = lat - ref.lat;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = ref;
    }
  }
  return best;
}

function exists() {
  return [SITES_PATH, GRID_PATH, SURFACE_PATH, SUMMARY_PATH].every((file) => fs.existsSync(file));
}

function build() {
  const payload = opencellid.getCells();
  const cells = payload.cells || [];
  if (!cells.length) throw new Error('No OpenCelliD cache available to build dashboard data');

  const geojson = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf8'));
  const index = geo.buildIndex(geojson);
  const { refs, byDun } = buildReferences(geojson, index);

  const field = {};
  (payload.fields || opencellid.FIELDS).forEach((name, i) => { field[name] = i; });

  const sites = [];
  const grid = new Map();
  const stats = {
    rows: 0,
    bounds: { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity },
    baseline: { min: Infinity, max: -Infinity, sum: 0 },
    modelScenario: { min: Infinity, max: -Infinity, sum: 0 },
    riskCounts: { Low: 0, Medium: 0, High: 0 },
    modelScenarioRiskCounts: { Low: 0, Medium: 0, High: 0 },
    radioCounts: {}
  };

  for (let i = 0; i < cells.length; i += 1) {
    const row = cells[i];
    const lon = row[field.lon];
    const lat = row[field.lat];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    const dun = row[field.dun];
    let baseline = row[field.lst];
    let delta = 0;
    if (baseline !== null && baseline !== undefined && dun && byDun.has(dun)) {
      delta = byDun.get(dun).delta;
    }
    if (baseline === null || baseline === undefined) {
      const ref = nearestReference(refs, lon, lat);
      if (!ref) continue;
      baseline = ref.lst;
      delta = ref.delta;
    }

    baseline = round(baseline, 3);
    delta = round(delta, 3);
    const scenario = round(baseline + delta, 3);
    const baselineRisk = riskCode(baseline);
    const scenarioRisk = riskCode(scenario);
    const range = Number.parseInt(row[field.range], 10) || 0;
    const samples = Number.parseInt(row[field.samples], 10) || 0;
    const radio = row[field.radio] || 'Unknown';
    const net = row[field.mnc];
    const area = row[field.lac];
    const cellId = row[field.cell];

    sites.push([
      `KV-${String(i + 1).padStart(6, '0')}`,
      round(lon, 4),
      round(lat, 4),
      baseline,
      baselineRisk,
      delta,
      range,
      radio,
      net,
      area,
      cellId,
      samples
    ]);

    stats.rows += 1;
    stats.bounds.west = Math.min(stats.bounds.west, lon);
    stats.bounds.south = Math.min(stats.bounds.south, lat);
    stats.bounds.east = Math.max(stats.bounds.east, lon);
    stats.bounds.north = Math.max(stats.bounds.north, lat);
    stats.baseline.min = Math.min(stats.baseline.min, baseline);
    stats.baseline.max = Math.max(stats.baseline.max, baseline);
    stats.baseline.sum += baseline;
    stats.modelScenario.min = Math.min(stats.modelScenario.min, scenario);
    stats.modelScenario.max = Math.max(stats.modelScenario.max, scenario);
    stats.modelScenario.sum += scenario;
    stats.riskCounts[RISK_NAME[baselineRisk]] += 1;
    stats.modelScenarioRiskCounts[RISK_NAME[scenarioRisk]] += 1;
    stats.radioCounts[radio] = (stats.radioCounts[radio] || 0) + 1;

    const gx = Math.floor(lon / GRID_SIZE);
    const gy = Math.floor(lat / GRID_SIZE);
    const key = `${gx}:${gy}`;
    const bucket = grid.get(key) || {
      gx,
      gy,
      count: 0,
      baselineSum: 0,
      scenarioSum: 0,
      max: -Infinity,
      high: 0,
      medium: 0,
      low: 0
    };
    bucket.count += 1;
    bucket.baselineSum += baseline;
    bucket.scenarioSum += scenario;
    bucket.max = Math.max(bucket.max, baseline);
    bucket[RISK_NAME[baselineRisk].toLowerCase()] += 1;
    grid.set(key, bucket);
  }

  if (!sites.length) throw new Error('No valid OpenCelliD records to build dashboard data');

  const baselineRange = stats.baseline.max - stats.baseline.min || 1;
  const features = [...grid.values()].map((bucket, i) => {
    const west = round(bucket.gx * GRID_SIZE, 4);
    const south = round(bucket.gy * GRID_SIZE, 4);
    const east = round(west + GRID_SIZE, 4);
    const north = round(south + GRID_SIZE, 4);
    const mean = bucket.baselineSum / bucket.count;
    const scenarioMean = bucket.scenarioSum / bucket.count;
    const highShare = bucket.high / bucket.count;
    const thermal = (mean - stats.baseline.min) / baselineRange;
    const exposure = Math.max(0, Math.min(100, (0.65 * thermal + 0.35 * highShare) * 100));
    const priority = exposure >= 70 ? 'Critical' : exposure >= 50 ? 'Elevated' : 'Watch';
    const id = `HX-${String(i + 1).padStart(4, '0')}`;
    return {
      type: 'Feature',
      id,
      properties: {
        cell_id: id,
        records: bucket.count,
        mean_lst_c: round(mean, 2),
        model_scenario_lst_c: round(scenarioMean, 2),
        max_lst_c: round(bucket.max, 2),
        high_risk_share: round(highShare, 3),
        exposure_index: round(exposure, 1),
        exposure_priority: priority,
        indicator_scope: 'Thermal exposure proxy; excludes demographic vulnerability and adaptive capacity'
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]]
      }
    };
  });

  const surfaceNodes = features.map((feature) => {
    const ring = feature.geometry.coordinates[0];
    return {
      lon: (ring[0][0] + ring[2][0]) / 2,
      lat: (ring[0][1] + ring[2][1]) / 2,
      baseline: feature.properties.mean_lst_c,
      modelScenario: feature.properties.model_scenario_lst_c,
      exposure: feature.properties.exposure_index
    };
  });

  const surface = {
    width: SURFACE_WIDTH,
    height: SURFACE_HEIGHT,
    bounds: {
      west: round(stats.bounds.west, 4),
      south: round(stats.bounds.south, 4),
      east: round(stats.bounds.east, 4),
      north: round(stats.bounds.north, 4)
    },
    interpolation: `Gaussian distance weighting over ${GRID_SIZE}-degree evidence-cell centroids; sigma ${SURFACE_SIGMA} degrees`,
    baseline: [],
    modelScenario: [],
    exposure: []
  };

  for (let y = 0; y < SURFACE_HEIGHT; y += 1) {
    const lat = surface.bounds.south + (y / (SURFACE_HEIGHT - 1)) * (surface.bounds.north - surface.bounds.south);
    for (let x = 0; x < SURFACE_WIDTH; x += 1) {
      const lon = surface.bounds.west + (x / (SURFACE_WIDTH - 1)) * (surface.bounds.east - surface.bounds.west);
      let weightSum = 0;
      let baselineSum = 0;
      let scenarioSum = 0;
      let exposureSum = 0;
      let nearest = null;
      let nearestDistance = Infinity;
      for (const node of surfaceNodes) {
        const lonDistance = (lon - node.lon) * Math.cos((lat * Math.PI) / 180);
        const latDistance = lat - node.lat;
        const distanceSquared = lonDistance ** 2 + latDistance ** 2;
        if (distanceSquared < nearestDistance) {
          nearestDistance = distanceSquared;
          nearest = node;
        }
        const weight = Math.exp(-distanceSquared / (2 * SURFACE_SIGMA ** 2));
        if (weight < 0.0001) continue;
        weightSum += weight;
        baselineSum += node.baseline * weight;
        scenarioSum += node.modelScenario * weight;
        exposureSum += node.exposure * weight;
      }
      surface.baseline.push(round(weightSum ? baselineSum / weightSum : nearest.baseline, 2));
      surface.modelScenario.push(round(weightSum ? scenarioSum / weightSum : nearest.modelScenario, 2));
      surface.exposure.push(round(weightSum ? exposureSum / weightSum : nearest.exposure, 1));
    }
  }

  stats.baseline.mean = stats.baseline.sum / stats.rows;
  stats.modelScenario.mean = stats.modelScenario.sum / stats.rows;
  delete stats.baseline.sum;
  delete stats.modelScenario.sum;
  for (const group of [stats.baseline, stats.modelScenario, stats.bounds]) {
    for (const key of Object.keys(group)) group[key] = round(group[key], 4);
  }

  const csvLines = ['radio,mcc,net,area,cell,unit,lon,lat,range,samples,changeable,created,updated,averageSignalStrength,predicted_lst_c,risk_tier,scenario_delta_c,scenario_lst_c,scenario_risk_tier'];
  for (const site of sites) {
    const scenario = round(site[3] + site[5], 3);
    csvLines.push([
      site[7], 502, site[8], site[9], site[10], 0,
      site[1], site[2], site[6], site[11], 1, 0, 0, 0,
      site[3], RISK_NAME[site[4]], site[5], scenario, RISK_NAME[riskCode(scenario)]
    ].join(','));
  }
  const csv = `${csvLines.join('\n')}\n`;

  const summary = {
    title: 'Klang Valley telecom thermal-risk decision dataset',
    generatedAt: new Date().toISOString(),
    source: 'OpenCelliD MCC 502 + UHVI DUN evidence (data/opencellid/cells.json)',
    sourceSha256: crypto.createHash('sha256').update(csv).digest('hex'),
    thresholdsC: { Low: '< 32', Medium: '32 to < 38', High: '>= 38' },
    ...stats,
    grid: {
      cellCount: features.length,
      nominalResolutionDegrees: GRID_SIZE,
      caveat: 'Operational thermal-exposure grid; not a demographic Heat Vulnerability Index.'
    },
    smoothSurface: {
      width: SURFACE_WIDTH,
      height: SURFACE_HEIGHT,
      source: 'surface_matrix.json',
      caveat: 'Visual interpolation only; inspect source grid cells for exact aggregate values.'
    }
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SITES_PATH, JSON.stringify({
    schema: ['id', 'lon', 'lat', 'baseline_lst_c', 'baseline_risk_code', 'model_delta_c', 'range_m', 'radio', 'network', 'area', 'cell', 'samples'],
    riskNames: RISK_NAME,
    rows: sites
  }));
  fs.writeFileSync(GRID_PATH, JSON.stringify({ type: 'FeatureCollection', name: 'heat_exposure_grid', features }));
  fs.writeFileSync(SURFACE_PATH, JSON.stringify(surface));
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(CSV_PATH, csv);

  return { sites: sites.length, gridCells: features.length, summary };
}

module.exports = { build, exists, SITES_PATH, GRID_PATH, SURFACE_PATH, SUMMARY_PATH, CSV_PATH };
