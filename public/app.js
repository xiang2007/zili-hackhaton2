var app = {
  meta: null,
  geojson: null,
  fields: [],
  cells: [],
  rawCells: [],
  fieldIndex: {},
  polygonIndex: [],
  csvRecords: [],
  map: null,
  heatLayer: null,
  cellLayerGroup: null,
  cellMarkers: [],
  districtLayer: null,
  pngLayer: null,
  colorMode: 'risk',
  siteIdCounter: 1,
  proposedSites: {},
  currentThermalWeight: 0.65,
  currentCoverageWeight: 0.35,
  singleSelectState: { rangeCirc: null, waveCirc: null, active: false, r: 0, max: 0, animId: null },
  savedFeedbackList: [],
  isAreaSelectMode: false,
  hasAreaSelection: false,
  multiSelectLayers: [],
  boxStartPoint: null,
  selectionBoxDiv: null,
  isPlacementMode: false,
  isResizing: false,
  baselineHigh: 0,
  baselineMeanLst: 0,
  loadErrors: [],
  cellBuildState: 'idle',
  scenarioRaf: null,
  initialized: false
};

var map = null;

var INITIAL_OPACITY = 72;
var RISK_COLORS = { Low: '#10b981', Medium: '#ffd700', High: '#ff0055' };
var RISK_FALLBACK = '#64748b';
var RADIO_COLORS = { GSM: '#82c341', UMTS: '#e37b35', LTE: '#5a9bd4', NR: '#a855f7', CDMA: '#94a3b8', NBIOT: '#94a3b8' };
var RADIO_FALLBACK = '#94a3b8';
var HEAT_INTENSITY = { High: 1, Medium: 0.6, Low: 0.25 };
var HEAT_FALLBACK = 0.1;
var LOW_MAX = 32;
var MEDIUM_MAX = 38;
var PNG_FALLBACK_BOUNDS = [101.15, 2.65, 102.02, 3.48];
var PNG_FALLBACK_PATH = '/data/UHVI_Klang_Valley_v2_2.png';

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  var parsed = parseFloat(value);
  return isFinite(parsed) ? parsed : null;
}

function toLatLngBounds(bounds) {
  if (!bounds) return null;
  if (bounds instanceof L.LatLngBounds) return bounds;
  if (Array.isArray(bounds) && bounds.length === 2 && Array.isArray(bounds[0]) && Array.isArray(bounds[1])) {
    return L.latLngBounds([bounds[0][0], bounds[0][1]], [bounds[1][0], bounds[1][1]]);
  }
  if (Array.isArray(bounds) && bounds.length === 4) {
    return L.latLngBounds([bounds[1], bounds[0]], [bounds[3], bounds[2]]);
  }
  return bounds;
}

function fmt(value, digits) {
  var parsed = num(value);
  if (parsed === null) return 'n/a';
  return parsed.toFixed(digits === undefined ? 2 : digits);
}

function el(id) {
  return document.getElementById(id);
}

function riskColor(risk) {
  return RISK_COLORS[risk] || RISK_FALLBACK;
}

function radioColor(radio) {
  if (!radio) return RADIO_FALLBACK;
  var key = String(radio).toUpperCase();
  if (key === 'NBIOT' || key === 'NB-IOT' || key === 'CDMA') return RADIO_COLORS.CDMA;
  return RADIO_COLORS[key] || RADIO_FALLBACK;
}

function cellColor(cell) {
  if (app.colorMode === 'radio') return radioColor(cell.radio);
  return riskColor(cell.risk);
}

function uhviColor(value) {
  var v = num(value);
  if (v === null) return '#64748b';
  if (v >= 0.192 && v <= 0.326) return '#f6f7c1';
  if (v > 0.326 && v <= 0.422) return '#f9d97e';
  if (v > 0.422 && v <= 0.609) return '#f59a4e';
  if (v > 0.609 && v <= 0.750) return '#e8452c';
  if (v > 0.750 && v <= 0.886) return '#b01030';
  return '#64748b';
}

function currentOpacity() {
  var slider = el('opacity-slider');
  var value = slider ? parseFloat(slider.value) : INITIAL_OPACITY;
  return isFinite(value) ? value : INITIAL_OPACITY;
}

function currentNet() {
  var reg = parseFloat(el('slider-reg') ? el('slider-reg').value : 0);
  var cool = parseFloat(el('slider-cool') ? el('slider-cool').value : 0);
  if (!isFinite(reg)) reg = 0;
  if (!isFinite(cool)) cool = 0;
  return reg + cool;
}

function setDataStatus(message, isError) {
  var status = el('data-status');
  if (!status) return;
  status.innerText = message;
  status.style.color = isError ? '#ff0055' : 'var(--text-muted)';
}

function initApp() {
  if (app.initialized) return;
  app.initialized = true;
  setupSidebarResize();
  setupMap();
  loadData();
}

function setupSidebarResize() {
  var sidebar = el('sidebar-panel');
  var resizer = el('sidebar-resizer');
  if (!sidebar || !resizer) return;
  resizer.addEventListener('mousedown', function (e) {
    app.isResizing = true;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'ew-resize';
    e.preventDefault();
  });
  window.addEventListener('mousemove', function (e) {
    if (!app.isResizing) return;
    var newWidth = e.clientX;
    if (newWidth < 250) newWidth = 250;
    if (newWidth > 750) newWidth = 750;
    sidebar.style.width = newWidth + 'px';
    if (map) map.invalidateSize();
  });
  window.addEventListener('mouseup', function () {
    if (!app.isResizing) return;
    app.isResizing = false;
    resizer.classList.remove('resizing');
    document.body.style.cursor = 'default';
    if (map) map.invalidateSize();
  });
}

function setupMap() {
  var bounds = [[2.5, 101.0], [3.5, 102.0]];
  map = L.map('map', { zoomControl: true, maxBounds: bounds, maxBoundsViscosity: 1.0, minZoom: 9, attributionControl: false }).setView([3.11, 101.6], 10);
  app.map = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'osm-basemap' }).addTo(map);
  L.control.attribution({ prefix: false }).addAttribution('© OpenStreetMap contributors').addTo(map);
  map.on('zoomend', updateMapZoomClass);
  updateMapZoomClass();
  map.on('click', onMapClick);
  setupAreaCanvas();
}

function updateMapZoomClass() {
  if (!map) return;
  var z = map.getZoom();
  var mapEl = el('map');
  if (!mapEl) return;
  mapEl.classList.remove('map-zoom-dots', 'map-zoom-clusters', 'map-zoom-teardrops');
  if (z <= 13) mapEl.classList.add('map-zoom-dots');
  else if (z === 14) mapEl.classList.add('map-zoom-clusters');
  else mapEl.classList.add('map-zoom-teardrops');
}

function fetchJSON(url) {
  return fetch(url).then(function (response) {
    if (!response.ok) throw new Error(url + ' -> ' + response.status);
    return response.json();
  });
}

function loadData() {
  setDataStatus('Loading dataset...', false);
  var errors = [];
  Promise.all([
    fetchJSON('/api/meta').catch(function (error) { errors.push('meta: ' + error.message); return null; }),
    fetchJSON('/api/geojson').catch(function (error) { errors.push('geojson: ' + error.message); return null; }),
    fetchJSON('/api/cells').catch(function (error) { errors.push('cells: ' + error.message); return null; }),
    fetch('/api/csv').then(function (response) {
      if (!response.ok) throw new Error('/api/csv -> ' + response.status);
      return response.text();
    }).catch(function (error) { errors.push('csv: ' + error.message); return ''; })
  ]).then(function (results) {
    applyMeta(results[0]);
    applyGeojson(results[1]);
    applyCells(results[2]);
    applyCsv(results[3]);
    app.loadErrors = errors;
    buildLayers();
    populateLegends();
    updateKpis();
    updateScenario();
    updateOpacity(currentOpacity());
    if (app.cellBuildState !== 'building') showLoadedStatus();
  }).catch(function (error) {
    setDataStatus('Failed to render dataset: ' + (error && error.message ? error.message : error), true);
  });
}

function showLoadedStatus() {
  var errors = app.loadErrors || [];
  if (errors.length) {
    setDataStatus('Loaded with issues: ' + errors.join(' | '), true);
    return;
  }
  var count = app.cells.length;
  setDataStatus('Loaded ' + count.toLocaleString() + ' cell records and ' + (app.geojson && app.geojson.features ? app.geojson.features.length : 0) + ' DUN polygons.', false);
  if (!count) setDataStatus('No OpenCelliD cache available yet. Map shows districts only.', false);
}

function applyMeta(meta) {
  app.meta = meta;
  if (meta && meta.thresholds) {
    if (isFinite(meta.thresholds.low_max)) LOW_MAX = meta.thresholds.low_max;
    if (isFinite(meta.thresholds.medium_max)) MEDIUM_MAX = meta.thresholds.medium_max;
  }
}

function applyGeojson(geojson) {
  app.geojson = geojson;
  app.polygonIndex = buildPolygonIndex(geojson);
}

function applyCells(payload) {
  if (!payload || !payload.cells) {
    app.fields = [];
    app.cells = [];
    app.rawCells = [];
    return;
  }
  app.fields = payload.fields || [];
  app.rawCells = payload.cells || [];
  app.fieldIndex = {};
  for (var i = 0; i < app.fields.length; i += 1) app.fieldIndex[app.fields[i]] = i;
  app.cells = [];
  for (var j = 0; j < app.rawCells.length; j += 1) app.cells.push(normalizeCell(app.rawCells[j]));
  computeBaseline();
}

function normalizeCell(row) {
  var f = app.fieldIndex;
  return {
    radio: row[f.radio],
    mnc: row[f.mnc],
    lac: row[f.lac],
    cell: row[f.cell],
    lon: row[f.lon],
    lat: row[f.lat],
    range: row[f.range],
    samples: row[f.samples],
    lst: row[f.lst],
    risk: row[f.risk],
    dun: row[f.dun]
  };
}

function computeBaseline() {
  var high = 0;
  var sum = 0;
  var count = 0;
  for (var i = 0; i < app.cells.length; i += 1) {
    var cell = app.cells[i];
    if (cell.risk === 'High') high += 1;
    var lst = num(cell.lst);
    if (lst !== null) {
      sum += lst;
      count += 1;
    }
  }
  app.baselineHigh = high;
  app.baselineMeanLst = count ? sum / count : 0;
}

function applyCsv(text) {
  app.csvRecords = parseCsvRecords(text || '');
  filterCsvTable('');
}

function buildLayers() {
  buildDistrictLayer();
  buildCellLayer();
  buildHeatLayer();
  toggleHeatLayer();
  toggleNodes();
  toggleDistrictLayer();
  togglePngLayer();
}

function buildDistrictLayer() {
  if (app.districtLayer || !app.geojson) return;
  app.districtLayer = L.geoJSON(app.geojson, {
    style: function (feature) {
      var props = feature.properties || {};
      return {
        color: '#334155',
        weight: 1,
        opacity: 0.6,
        fillColor: uhviColor(props.UHVI_num),
        fillOpacity: 0.55
      };
    },
    onEachFeature: function (feature, layer) {
      layer.bindPopup(districtPopup(feature.properties || {}));
    }
  });
  if (el('chk-districts') && el('chk-districts').checked) map.addLayer(app.districtLayer);
}

function districtPopup(props) {
  var rows = [
    ['DUN', props.dun],
    ['Parliament', props.parlimen],
    ['District', props.klang_valley_uhvi_final_district],
    ['UHVI', fmt(props.UHVI_num, 3)],
    ['Mean LST', fmt(props.klang_valley_uhvi_final__LSTbasemean, 2) + ' °C'],
    ['Median income', fmt(props.klang_valley_uhvi_final_income_median, 0) + ' RM'],
    ['Elderly', fmt(props.klang_valley_uhvi_final_elderly_pct, 1) + ' %'],
    ['deltaGreen', fmt(props.green__deltaGreenmean, 4)]
  ];
  var html = '<div style="font-family:Inter, sans-serif; min-width:210px;">';
  html += '<h4 style="margin:0 0 8px 0; border-bottom:1px solid #333; padding-bottom:4px; font-size:0.95rem;">' + esc(props.dun) + '</h4>';
  html += '<table style="width:100%; font-size:0.78rem; border-collapse:collapse;">';
  for (var i = 0; i < rows.length; i += 1) {
    html += '<tr><td style="padding:2px 0; color:var(--text-muted);">' + esc(rows[i][0]) + '</td><td style="text-align:right; font-weight:bold;">' + esc(rows[i][1]) + '</td></tr>';
  }
  html += '</table></div>';
  return html;
}

function buildCellLayer() {
  if (app.cellLayerGroup || app.cellBuildState === 'building') return;
  app.cellLayerGroup = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 45,
    disableClusteringAtZoom: 14,
    removeOutsideVisibleBounds: true,
    spiderfyOnMaxZoom: false,
    iconCreateFunction: function (cluster) {
      var count = cluster.getChildCount();
      var size = count < 100 ? 34 : (count < 500 ? 38 : 44);
      var clusterTypeClass = count > 500 ? 'cluster-huge' : 'cluster-normal';
      return L.divIcon({
        html: '<div class="cluster-master ' + clusterTypeClass + '"><div class="cluster-dot"></div><div class="cluster-circle" style="width:' + size + 'px; height:' + size + 'px;">' + count + '</div></div>',
        className: 'custom-cluster-icon',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });
    }
  });
  if (!app.cells.length) {
    app.cellBuildState = 'ready';
    return;
  }
  app.cellBuildState = 'building';
  buildCellChunk(0);
}

function buildCellChunk(index) {
  var chunkSize = 2000;
  var end = Math.min(index + chunkSize, app.cells.length);
  for (var i = index; i < end; i += 1) {
    let cell = app.cells[i];
    let lat = num(cell.lat);
    let lon = num(cell.lon);
    if (lat === null || lon === null) continue;
    let color = cellColor(cell);
    let marker = L.circleMarker([lat, lon], { radius: 4, weight: 1, color: color, fillColor: color, fillOpacity: 0.8, opacity: 1 });
    marker._cell = cell;
    marker.bindPopup(function () { return cellPopup(cell); });
    marker.on('click', function (layer) {
      return function () {
        selectCell(layer.getLatLng(), num(cell.range));
      };
    }(marker));
    marker.on('popupclose', function () { clearSingleSelect(); });
    app.cellMarkers.push(marker);
    app.cellLayerGroup.addLayer(marker);
  }
  if (end < app.cells.length) {
    setDataStatus('Building cell markers ' + end.toLocaleString() + ' / ' + app.cells.length.toLocaleString() + '...', false);
    setTimeout(function () { buildCellChunk(end); }, 0);
    return;
  }
  app.cellBuildState = 'ready';
  applyCellColorMode();
  toggleNodes();
  showLoadedStatus();
}

function cellPopup(cell) {
  var color = cellColor(cell);
  var html = '<div style="font-family:Inter, sans-serif; min-width:170px;">';
  html += '<h4 style="margin:0 0 8px 0; border-bottom:1px solid #333; padding-bottom:4px; color:' + color + '; font-size:0.95rem;">Cell ID: ' + esc(cell.cell) + '</h4>';
  html += '<table style="width:100%; font-size:0.78rem; border-collapse:collapse;">';
  html += '<tr><td style="padding:3px 0; color:var(--text-muted);">Radio</td><td style="text-align:right; font-weight:bold;">' + esc(cell.radio) + '</td></tr>';
  html += '<tr><td style="padding:3px 0; color:var(--text-muted);">MNC / LAC</td><td style="text-align:right; font-weight:bold;">' + esc(cell.mnc) + ' / ' + esc(cell.lac) + '</td></tr>';
  html += '<tr><td style="padding:3px 0; color:var(--text-muted);">Range</td><td style="text-align:right; font-weight:bold;">' + esc(cell.range) + ' m</td></tr>';
  html += '<tr><td style="padding:3px 0; color:var(--text-muted);">Samples</td><td style="text-align:right; font-weight:bold;">' + esc(cell.samples) + '</td></tr>';
  html += '<tr><td style="padding:3px 0; color:var(--text-muted);">Est. LST</td><td style="text-align:right; font-weight:bold;">' + fmt(cell.lst, 2) + ' °C</td></tr>';
  html += '<tr><td style="padding:3px 0; color:var(--text-muted);">Risk</td><td style="text-align:right; font-weight:bold; color:' + riskColor(cell.risk) + ';">' + esc(cell.risk || 'Unknown') + '</td></tr>';
  html += '<tr><td style="padding:3px 0; color:var(--text-muted);">DUN</td><td style="text-align:right; font-weight:bold;">' + esc(cell.dun || 'n/a') + '</td></tr>';
  html += '</table></div>';
  return html;
}

function buildHeatLayer() {
  if (app.heatLayer) return;
  var data = [];
  for (var i = 0; i < app.cells.length; i += 1) {
    var cell = app.cells[i];
    var lat = num(cell.lat);
    var lon = num(cell.lon);
    if (lat === null || lon === null) continue;
    data.push([lat, lon, HEAT_INTENSITY[cell.risk] || HEAT_FALLBACK]);
  }
  app.heatLayer = L.heatLayer(data, {
    radius: 20,
    blur: 25,
    maxZoom: 13,
    max: 1.0,
    gradient: { 0.1: '#000080', 0.3: '#00ffff', 0.5: '#00ff00', 0.7: '#ffff00', 0.85: '#ff8800', 1.0: '#ff0000' }
  });
}

function populateLegends() {
  var radioCounts = { GSM: 0, UMTS: 0, LTE: 0, NR: 0, CDMA: 0 };
  var riskCounts = { Low: 0, Medium: 0, High: 0, Unknown: 0 };
  for (var i = 0; i < app.cells.length; i += 1) {
    var cell = app.cells[i];
    var radio = cell.radio ? String(cell.radio).toUpperCase() : '';
    if (radio === 'NBIOT' || radio === 'NB-IOT' || radio === 'CDMA') radio = 'CDMA';
    if (radioCounts[radio] === undefined) radioCounts[radio] = 0;
    radioCounts[radio] += 1;
    if (cell.risk === 'Low' || cell.risk === 'Medium' || cell.risk === 'High') riskCounts[cell.risk] += 1;
    else riskCounts.Unknown += 1;
  }
  var radioEl = el('radio-legend');
  if (radioEl) {
    var radioOrder = ['GSM', 'UMTS', 'LTE', 'NR', 'CDMA'];
    var radioHtml = '';
    for (var r = 0; r < radioOrder.length; r += 1) {
      var key = radioOrder[r];
      var label = key === 'CDMA' ? 'CDMA / NBIOT' : key;
      radioHtml += '<div style="display:flex; align-items:center; gap:6px; margin:4px 0;"><span style="width:12px; height:12px; border-radius:50%; background:' + radioColor(key) + '; display:inline-block;"></span><span style="flex:1;">' + label + '</span><span style="font-weight:bold;">' + radioCounts[key].toLocaleString() + '</span></div>';
    }
    radioEl.innerHTML = radioHtml;
  }
  var riskEl = el('risk-legend');
  if (riskEl) {
    var riskOrder = [['High', 'High (>=38 °C)'], ['Medium', 'Medium (32-38 °C)'], ['Low', 'Low (<32 °C)'], ['Unknown', 'Unknown']];
    var riskHtml = '';
    for (var k = 0; k < riskOrder.length; k += 1) {
      riskHtml += '<div style="display:flex; align-items:center; gap:6px; margin:4px 0;"><span style="width:12px; height:12px; border-radius:50%; background:' + riskColor(riskOrder[k][0]) + '; display:inline-block;"></span><span style="flex:1;">' + riskOrder[k][1] + '</span><span style="font-weight:bold;">' + riskCounts[riskOrder[k][0]].toLocaleString() + '</span></div>';
    }
    riskEl.innerHTML = riskHtml;
  }
  var attribution = el('cell-attribution');
  if (attribution) {
    attribution.innerHTML = 'Cell data © OpenCelliD (CC BY-SA 4.0) · <a href="https://opencellid.org" target="_blank" rel="noopener" style="color:var(--accent);">opencellid.org</a>';
  }
}

function updateKpis() {
  var total = app.cells.length;
  var high = 0;
  var sum = 0;
  var count = 0;
  for (var i = 0; i < app.cells.length; i += 1) {
    var cell = app.cells[i];
    if (cell.risk === 'High') high += 1;
    var lst = num(cell.lst);
    if (lst !== null) {
      sum += lst;
      count += 1;
    }
  }
  var mean = count ? sum / count : 0;
  var highPct = total ? (high / total) * 100 : 0;
  var priority = 0;
  if (app.geojson && app.geojson.features) {
    for (var f = 0; f < app.geojson.features.length; f += 1) {
      var v = num(app.geojson.features[f].properties.UHVI_num);
      if (v !== null && v >= 0.609) priority += 1;
    }
  }
  setText('kpi-records', total.toLocaleString());
  setText('kpi-records-sub', total ? 'observed cells (KV)' : 'awaiting OpenCelliD cache');
  setText('kpi-highrisk', high.toLocaleString());
  setText('kpi-highrisk-sub', total ? highPct.toFixed(1) + '% of portfolio' : 'no records loaded');
  setText('kpi-meanlst', mean.toFixed(1) + '°');
  setText('kpi-meanlst-sub', 'modelled surface °C');
  setText('kpi-priority', priority.toLocaleString());
  setText('kpi-priority-sub', 'elevated + critical');
}

function setText(id, value) {
  var node = el(id);
  if (node) node.innerText = value;
}

function selectCell(latlng, range) {
  if (app.hasAreaSelection) clearAreaSelection();
  clearSingleSelect();
  var coverage = range && isFinite(range) && range > 0 ? range : 1000;
  app.singleSelectState.rangeCirc = L.circle(latlng, { radius: coverage, color: '#00f2fe', weight: 2.5, fillOpacity: 0.12, dashArray: '6, 6' }).addTo(map);
  app.singleSelectState.waveCirc = L.circle(latlng, { radius: 0, color: '#00f2fe', weight: 3, fillOpacity: 0.35 }).addTo(map);
  app.singleSelectState.active = true;
  app.singleSelectState.max = coverage;
  app.singleSelectState.r = 0;
  animateSingleWave();
}

function animateSingleWave() {
  if (!app.singleSelectState.active) return;
  app.singleSelectState.r += 14;
  if (app.singleSelectState.r > app.singleSelectState.max) app.singleSelectState.r = 0;
  if (app.singleSelectState.waveCirc) {
    app.singleSelectState.waveCirc.setRadius(app.singleSelectState.r);
    var fade = 1 - (app.singleSelectState.r / app.singleSelectState.max);
    app.singleSelectState.waveCirc.setStyle({ opacity: fade * 0.9 + 0.1, fillOpacity: fade * 0.35 });
  }
  app.singleSelectState.animId = requestAnimationFrame(animateSingleWave);
}

function clearSingleSelect() {
  app.singleSelectState.active = false;
  if (app.singleSelectState.animId) {
    cancelAnimationFrame(app.singleSelectState.animId);
    app.singleSelectState.animId = null;
  }
  if (app.singleSelectState.rangeCirc) {
    map.removeLayer(app.singleSelectState.rangeCirc);
    app.singleSelectState.rangeCirc = null;
  }
  if (app.singleSelectState.waveCirc) {
    map.removeLayer(app.singleSelectState.waveCirc);
    app.singleSelectState.waveCirc = null;
  }
}

function openTab(evt, tabName) {
  var tabcontent = document.getElementsByClassName('tab-content');
  for (var i = 0; i < tabcontent.length; i += 1) tabcontent[i].classList.remove('active');
  var tablinks = document.getElementsByClassName('tab-btn');
  for (var j = 0; j < tablinks.length; j += 1) tablinks[j].classList.remove('active');
  var target = el(tabName);
  if (target) target.classList.add('active');
  if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');
  if (map) setTimeout(function () { map.invalidateSize(); }, 60);
}

function openFeedbackModal() {
  var modal = el('feedback-modal');
  if (modal) modal.style.display = 'flex';
}

function closeFeedbackModal() {
  var modal = el('feedback-modal');
  if (modal) modal.style.display = 'none';
}

function submitFeedbackModal() {
  var agency = el('fb-agency') ? el('fb-agency').value : '';
  var task = el('fb-task') ? el('fb-task').value : '';
  var ease = el('fb-ease') ? el('fb-ease').value : '';
  var improvement = el('fb-improvement') ? el('fb-improvement').value : '';
  var confirmed = el('fb-check') ? el('fb-check').checked : false;

  if (!agency.trim()) { alert('Please enter an agency or team name.'); return; }
  if (!confirmed) { alert('Please check the confirmation box before saving response.'); return; }

  app.savedFeedbackList.push({ agency: agency, task: task, ease: ease, improvement: improvement, timestamp: new Date().toISOString() });
  var label = el('response-count-label');
  if (label) label.innerText = app.savedFeedbackList.length + (app.savedFeedbackList.length === 1 ? ' saved response' : ' saved responses');

  alert('Feedback saved successfully!');
  if (el('fb-agency')) el('fb-agency').value = '';
  if (el('fb-improvement')) el('fb-improvement').value = '';
  if (el('fb-check')) el('fb-check').checked = false;
  closeFeedbackModal();
}

function exportJSONResponses() {
  if (app.savedFeedbackList.length === 0) { alert('No responses saved yet.'); return; }
  var dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(app.savedFeedbackList, null, 2));
  var dlAnchor = document.createElement('a');
  dlAnchor.setAttribute('href', dataStr);
  dlAnchor.setAttribute('download', 'workshop_feedback_log.json');
  document.body.appendChild(dlAnchor);
  dlAnchor.click();
  dlAnchor.remove();
}

function openInfoModal() {
  var modal = el('info-modal');
  if (modal) modal.style.display = 'flex';
}

function closeInfoModal() {
  var modal = el('info-modal');
  if (modal) modal.style.display = 'none';
}

function updateScenario() {
  var reg = parseFloat(el('slider-reg') ? el('slider-reg').value : 0);
  var cool = parseFloat(el('slider-cool') ? el('slider-cool').value : 0);
  if (!isFinite(reg)) reg = 0;
  if (!isFinite(cool)) cool = 0;
  var net = reg + cool;

  setText('val-reg', (reg > 0 ? '+' : '') + reg.toFixed(1) + ' °C');
  setText('val-cool', (cool > 0 ? '+' : '') + cool.toFixed(1) + ' °C');
  setText('net-adj', (net > 0 ? '+' : '') + net.toFixed(1) + ' °C');
  setText('net-adj-desc', net === 0 ? 'Baseline conditions' : (net > 0 ? 'Net regional warming' : 'Net cooling intervention'));

  if (app.scenarioRaf) cancelAnimationFrame(app.scenarioRaf);
  app.scenarioRaf = requestAnimationFrame(function () {
    app.scenarioRaf = null;
    renderScenarioStats(net);
  });
}

function renderScenarioStats(net) {
  var scenarioHigh = 0;
  var sum = 0;
  var count = 0;
  for (var i = 0; i < app.cells.length; i += 1) {
    var lst = num(app.cells[i].lst);
    if (lst === null) continue;
    var scenarioLst = lst + net;
    if (scenarioLst >= MEDIUM_MAX) scenarioHigh += 1;
    sum += scenarioLst;
    count += 1;
  }
  var change = scenarioHigh - app.baselineHigh;
  setText('stat-risk', scenarioHigh.toLocaleString());
  var changeEl = el('stat-change');
  if (changeEl) {
    changeEl.innerText = (change > 0 ? '+' : '') + change.toLocaleString();
    changeEl.style.color = change > 0 ? 'var(--red)' : (change < 0 ? 'var(--green)' : 'var(--text-main)');
  }
  setText('stat-mean', (count ? sum / count : 0).toFixed(1) + ' °C');
}

function resetScenario() {
  if (el('slider-reg')) el('slider-reg').value = 0;
  if (el('slider-cool')) el('slider-cool').value = 0;
  updateScenario();
}

function updateWeights(val) {
  if (val === undefined || val === null || val === '') val = el('weight-slider') ? el('weight-slider').value : 65;
  val = parseFloat(val);
  if (!isFinite(val)) val = 65;
  setText('weight-thermal-val', val + '%');
  setText('weight-coverage-val', (100 - val) + '%');
  app.currentThermalWeight = val / 100;
  app.currentCoverageWeight = (100 - val) / 100;

  for (var id in app.proposedSites) {
    if (!Object.prototype.hasOwnProperty.call(app.proposedSites, id)) continue;
    var site = app.proposedSites[id];
    var finalScore = Math.round((site.baseThermalScore * app.currentThermalWeight) + (site.baseCoverageScore * app.currentCoverageWeight));
    var scoreBadge = el('score-badge-' + id);
    var statusText = el('status-text-' + id);
    if (scoreBadge && statusText) {
      scoreBadge.innerText = finalScore;
      if (finalScore >= 70) { scoreBadge.style.background = '#10b981'; statusText.innerText = 'Approved'; }
      else if (finalScore >= 40) { scoreBadge.style.background = '#92400e'; statusText.innerText = 'Conditional review'; }
      else { scoreBadge.style.background = '#991b1b'; statusText.innerText = 'Hold / redesign'; }
    }
  }
}

function toggleHeatLayer() {
  if (!app.heatLayer) return;
  var checkbox = el('chk-heat');
  var checked = checkbox ? checkbox.checked : true;
  if (checked) {
    if (!map.hasLayer(app.heatLayer)) map.addLayer(app.heatLayer);
  } else if (map.hasLayer(app.heatLayer)) {
    map.removeLayer(app.heatLayer);
  }
}

function toggleNodes() {
  if (!app.cellLayerGroup || app.cellBuildState === 'building') return;
  var checkbox = el('chk-cells');
  var checked = checkbox ? checkbox.checked : true;
  if (checked) {
    if (!map.hasLayer(app.cellLayerGroup)) map.addLayer(app.cellLayerGroup);
  } else if (map.hasLayer(app.cellLayerGroup)) {
    map.removeLayer(app.cellLayerGroup);
  }
}

function toggleDistrictLayer() {
  if (!app.districtLayer) buildDistrictLayer();
  if (!app.districtLayer) return;
  var checkbox = el('chk-districts');
  var checked = checkbox ? checkbox.checked : false;
  if (checked) {
    if (!map.hasLayer(app.districtLayer)) map.addLayer(app.districtLayer);
  } else if (map.hasLayer(app.districtLayer)) {
    map.removeLayer(app.districtLayer);
  }
}

function togglePngLayer() {
  var checkbox = el('chk-png');
  var checked = checkbox ? checkbox.checked : false;
  if (checked) {
    if (!app.pngLayer) {
      var meta = app.meta || {};
      var png = meta.png || {};
      var path = png.path || PNG_FALLBACK_PATH;
      var bounds = toLatLngBounds(png.bounds || PNG_FALLBACK_BOUNDS);
      app.pngLayer = L.imageOverlay(path, bounds, { opacity: currentOpacity() / 100 });
      app.pngLayer.bindPopup('UHVI Klang Valley reference overlay · ' + (png.note || 'approximate reference overlay'));
    }
    if (!map.hasLayer(app.pngLayer)) map.addLayer(app.pngLayer);
    app.pngLayer.setOpacity(currentOpacity() / 100);
  } else if (app.pngLayer && map.hasLayer(app.pngLayer)) {
    map.removeLayer(app.pngLayer);
  }
}

function updateOpacity(val) {
  var value = parseFloat(val);
  if (!isFinite(value)) value = currentOpacity();
  setText('opacity-val', value + '%');
  var heatCanvas = document.querySelector('.leaflet-heatmap-layer');
  if (heatCanvas) heatCanvas.style.opacity = value / 100;
  if (app.pngLayer) app.pngLayer.setOpacity(value / 100);
}

function setColorMode() {
  var select = el('color-mode');
  app.colorMode = select && select.value ? select.value : 'risk';
  if (app.cellBuildState !== 'building') applyCellColorMode();
  populateLegends();
}

function applyCellColorMode() {
  for (var i = 0; i < app.cellMarkers.length; i += 1) {
    var marker = app.cellMarkers[i];
    var cell = marker._cell;
    if (!cell) continue;
    var color = cellColor(cell);
    marker.setStyle({ color: color, fillColor: color });
  }
}

function flyToState() {
  var locations = {
    klang_valley: { lat: 3.11, lng: 101.6, zoom: 10 },
    dbkl: { lat: 3.1390, lng: 101.6869, zoom: 13 },
    mbsa: { lat: 3.0738, lng: 101.5183, zoom: 13 },
    mbpj: { lat: 3.1073, lng: 101.6067, zoom: 13 }
  };
  var selector = el('state-selector');
  var target = locations[selector ? selector.value : 'klang_valley'] || locations.klang_valley;
  if (!map) return;
  map.flyTo([target.lat, target.lng], target.zoom, { animate: true, duration: 1.5 });
}

function ringBbox(ring) {
  var minLon = Infinity;
  var minLat = Infinity;
  var maxLon = -Infinity;
  var maxLat = -Infinity;
  for (var i = 0; i < ring.length; i += 1) {
    var lon = ring[i][0];
    var lat = ring[i][1];
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

function bboxContains(bbox, lon, lat) {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

function pointInRing(lon, lat, ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    var xi = ring[i][0];
    var yi = ring[i][1];
    var xj = ring[j][0];
    var yj = ring[j][1];
    var crosses = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function centroidOfRings(rings) {
  var sumLon = 0;
  var sumLat = 0;
  var count = 0;
  for (var i = 0; i < rings.length; i += 1) {
    var ring = rings[i].ring;
    for (var j = 0; j < ring.length; j += 1) {
      sumLon += ring[j][0];
      sumLat += ring[j][1];
      count += 1;
    }
  }
  return count ? { lon: sumLon / count, lat: sumLat / count } : null;
}

function buildPolygonIndex(geojson) {
  var index = [];
  var features = geojson && geojson.features ? geojson.features : [];
  for (var f = 0; f < features.length; f += 1) {
    var feature = features[f];
    var geometry = feature.geometry;
    var rings = [];
    if (geometry) {
      var polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
      for (var p = 0; p < polygons.length; p += 1) {
        var polygon = polygons[p];
        for (var r = 0; r < polygon.length; r += 1) {
          var ring = polygon[r];
          rings.push({ ring: ring, bbox: ringBbox(ring), poly: p, hole: r > 0 });
        }
      }
    }
    index.push({ props: feature.properties || {}, rings: rings, centroid: centroidOfRings(rings) });
  }
  return index;
}

function pointInEntry(entry, lon, lat) {
  var polygons = {};
  for (var i = 0; i < entry.rings.length; i += 1) {
    var item = entry.rings[i];
    if (!bboxContains(item.bbox, lon, lat)) continue;
    if (!polygons[item.poly]) polygons[item.poly] = [];
    polygons[item.poly].push(item);
  }
  var keys = Object.keys(polygons);
  for (var k = 0; k < keys.length; k += 1) {
    var rings = polygons[keys[k]];
    var inside = false;
    for (var j = 0; j < rings.length; j += 1) {
      var hit = pointInRing(lon, lat, rings[j].ring);
      if (rings[j].hole) {
        if (hit) inside = false;
      } else if (hit) {
        inside = true;
      }
    }
    if (inside) return true;
  }
  return false;
}

function locateDun(lon, lat) {
  for (var i = 0; i < app.polygonIndex.length; i += 1) {
    if (pointInEntry(app.polygonIndex[i], lon, lat)) return app.polygonIndex[i];
  }
  return null;
}

function nearestDunCentroid(lon, lat) {
  var best = null;
  var bestDistance = Infinity;
  for (var i = 0; i < app.polygonIndex.length; i += 1) {
    var entry = app.polygonIndex[i];
    if (!entry.centroid) continue;
    var distance = equirectKm(lat, lon, entry.centroid.lat, entry.centroid.lon);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return best;
}

function dunLst(props) {
  return num(props ? props.klang_valley_uhvi_final__LSTbasemean : null);
}

function equirectKm(lat1, lon1, lat2, lon2) {
  var radius = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var x = dLon * Math.cos((lat1 + lat2) * Math.PI / 360);
  return Math.sqrt(x * x + dLat * dLat) * radius;
}

function nearestCellKm(lat, lon) {
  var best = Infinity;
  for (var i = 0; i < app.cells.length; i += 1) {
    var cell = app.cells[i];
    var clat = num(cell.lat);
    var clon = num(cell.lon);
    if (clat === null || clon === null) continue;
    var distance = equirectKm(lat, lon, clat, clon);
    if (distance < best) best = distance;
  }
  return best;
}

function setupAreaCanvas() {
  var canvas = el('selection-canvas');
  if (canvas) canvas.addEventListener('mousedown', onCanvasMouseDown);
}

function toggleAreaSelect() {
  var btn = el('area-select-btn');
  var status = el('area-select-status');
  var canvas = el('selection-canvas');
  if (!canvas) return;

  if (app.hasAreaSelection) { clearAreaSelection(); return; }
  clearSingleSelect();

  app.isAreaSelectMode = !app.isAreaSelectMode;
  if (app.isAreaSelectMode) {
    if (btn) {
      btn.style.background = '#ff0055';
      btn.style.color = '#fff';
      btn.style.borderColor = '#ff0055';
      btn.innerText = 'Cancel Highlighting';
    }
    if (status) status.style.display = 'block';
    if (map) map.dragging.disable();
    canvas.style.display = 'block';
  } else {
    resetHighlightUI();
  }
}

function resetHighlightUI() {
  app.isAreaSelectMode = false;
  var btn = el('area-select-btn');
  var status = el('area-select-status');
  var canvas = el('selection-canvas');
  if (btn) {
    btn.style.background = 'rgba(0, 242, 254, 0.1)';
    btn.style.color = 'var(--accent)';
    btn.style.borderColor = 'var(--accent)';
    btn.innerText = 'Highlight Area (Multi-Select)';
  }
  if (status) status.style.display = 'none';
  if (map) map.dragging.enable();
  if (canvas) canvas.style.display = 'none';
  if (app.selectionBoxDiv) {
    app.selectionBoxDiv.remove();
    app.selectionBoxDiv = null;
  }
}

function canvasPoint(e) {
  var canvas = el('selection-canvas');
  if (!canvas) return { x: e.clientX, y: e.clientY };
  var rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onCanvasMouseDown(e) {
  app.boxStartPoint = canvasPoint(e);
  var box = document.createElement('div');
  box.style.position = 'absolute';
  box.style.border = '2px dashed #00f2fe';
  box.style.background = 'rgba(0, 242, 254, 0.15)';
  box.style.left = app.boxStartPoint.x + 'px';
  box.style.top = app.boxStartPoint.y + 'px';
  var canvas = el('selection-canvas');
  if (canvas) canvas.appendChild(box);
  app.selectionBoxDiv = box;
  window.addEventListener('mousemove', onCanvasMouseMove);
  window.addEventListener('mouseup', onCanvasMouseUp);
}

function onCanvasMouseMove(e) {
  if (!app.boxStartPoint || !app.selectionBoxDiv) return;
  var point = canvasPoint(e);
  var left = Math.min(app.boxStartPoint.x, point.x);
  var top = Math.min(app.boxStartPoint.y, point.y);
  var width = Math.abs(point.x - app.boxStartPoint.x);
  var height = Math.abs(point.y - app.boxStartPoint.y);
  app.selectionBoxDiv.style.left = left + 'px';
  app.selectionBoxDiv.style.top = top + 'px';
  app.selectionBoxDiv.style.width = width + 'px';
  app.selectionBoxDiv.style.height = height + 'px';
}

function onCanvasMouseUp(e) {
  window.removeEventListener('mousemove', onCanvasMouseMove);
  window.removeEventListener('mouseup', onCanvasMouseUp);
  var canvas = el('selection-canvas');
  if (!canvas || !app.boxStartPoint) return;
  var rect = canvas.getBoundingClientRect();
  var endX = e.clientX - rect.left;
  var endY = e.clientY - rect.top;
  var pt1 = map.containerPointToLatLng([Math.min(app.boxStartPoint.x, endX), Math.min(app.boxStartPoint.y, endY)]);
  var pt2 = map.containerPointToLatLng([Math.max(app.boxStartPoint.x, endX), Math.max(app.boxStartPoint.y, endY)]);
  var bounds = L.latLngBounds(pt1, pt2);
  resetHighlightUI();
  processAreaSelection(bounds);
}

function processAreaSelection(bounds) {
  var selected = [];
  for (var i = 0; i < app.cells.length; i += 1) {
    var cell = app.cells[i];
    var lat = num(cell.lat);
    var lon = num(cell.lon);
    if (lat === null || lon === null) continue;
    if (bounds.contains([lat, lon])) selected.push(cell);
  }
  if (selected.length === 0) return;

  app.hasAreaSelection = true;
  var btn = el('area-select-btn');
  if (btn) {
    btn.style.background = '#1e293b';
    btn.style.color = '#fff';
    btn.style.borderColor = '#ffffff';
    btn.innerText = 'Clear Pattern (' + selected.length + ' cells)';
  }
  var hullPoints = computeConvexHull(selected);
  if (hullPoints.length > 2) {
    var outerBorder = L.polygon(hullPoints, {
      color: '#00f2fe',
      weight: 4,
      dashArray: '8, 8',
      fill: true,
      fillColor: '#00f2fe',
      fillOpacity: 0.15
    }).addTo(map);
    app.multiSelectLayers.push(outerBorder);
  }
}

function computeConvexHull(cells) {
  var points = cells.map(function (cell) { return [num(cell.lat), num(cell.lon)]; });
  if (points.length <= 3) return points;
  var start = points[0];
  for (var i = 0; i < points.length; i += 1) {
    var p = points[i];
    if (p[1] < start[1] || (p[1] === start[1] && p[0] < start[0])) start = p;
  }
  var hull = [];
  var current = start;
  do {
    hull.push(current);
    var next = points[0];
    for (var j = 0; j < points.length; j += 1) {
      var candidate = points[j];
      if (next === current || crossProduct(current, next, candidate) < 0) next = candidate;
    }
    current = next;
  } while (current !== start && hull.length < points.length);
  return hull;
}

function crossProduct(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function clearAreaSelection() {
  app.hasAreaSelection = false;
  app.multiSelectLayers.forEach(function (layer) { map.removeLayer(layer); });
  app.multiSelectLayers = [];
  var btn = el('area-select-btn');
  if (btn) {
    btn.style.background = 'rgba(0, 242, 254, 0.1)';
    btn.style.color = 'var(--accent)';
    btn.style.borderColor = 'var(--accent)';
    btn.innerText = 'Highlight Area (Multi-Select)';
  }
}

function togglePlacementMode() {
  app.isPlacementMode = !app.isPlacementMode;
  var btn = el('placement-btn');
  var status = el('placement-status');
  if (app.isPlacementMode) {
    if (btn) {
      btn.style.background = '#00f2fe';
      btn.style.borderColor = '#00f2fe';
      btn.style.color = '#000';
      btn.innerText = 'Cancel placement';
    }
    if (status) status.innerHTML = '<span style="color:#00f2fe;">Placement mode is ON.</span> Click anywhere on the map.';
    if (map) map.getContainer().style.cursor = 'crosshair';
  } else {
    if (btn) {
      btn.style.background = '#ff0055';
      btn.style.borderColor = '#ff0055';
      btn.style.color = '#fff';
      btn.innerText = 'Place proposed site';
    }
    if (status) status.innerText = 'Placement mode is off.';
    if (map) map.getContainer().style.cursor = '';
  }
}

function onMapClick(e) {
  if (!app.isPlacementMode) return;
  var lat = e.latlng.lat;
  var lng = e.latlng.lng;
  var id = 'site_' + app.siteIdCounter;
  var propName = 'PROP-' + String(app.siteIdCounter).padStart(2, '0');
  app.siteIdCounter += 1;

  var located = locateDun(lng, lat);
  if (!located) located = nearestDunCentroid(lng, lat);
  var props = located ? located.props : null;
  var lst = dunLst(props);
  if (lst === null) lst = app.baselineMeanLst || 32;
  var scenarioLst = lst + currentNet();

  var riskClass, hexColor;
  if (scenarioLst >= MEDIUM_MAX) { riskClass = 'Critical'; hexColor = 'var(--red)'; }
  else if (scenarioLst >= LOW_MAX) { riskClass = 'Elevated'; hexColor = 'var(--yellow)'; }
  else { riskClass = 'Nominal'; hexColor = 'var(--accent)'; }

  var nearestKm = nearestCellKm(lat, lng);
  if (!isFinite(nearestKm)) nearestKm = 0;
  var baseThermalScore = clamp(100 - (scenarioLst - 28) * 6, 0, 100);
  var baseCoverageScore = clamp((nearestKm / 3) * 100, 0, 100);
  var initialFinalScore = Math.round((baseThermalScore * app.currentThermalWeight) + (baseCoverageScore * app.currentCoverageWeight));
  var initialStatus = initialFinalScore >= 70 ? 'Approved' : (initialFinalScore >= 40 ? 'Conditional review' : 'Hold / redesign');
  var initialBadgeColor = initialFinalScore >= 70 ? '#10b981' : (initialFinalScore >= 40 ? '#92400e' : '#991b1b');
  var coverageRadiusMeters = 500;

  var boundsCircle = L.circle([lat, lng], { radius: coverageRadiusMeters, color: hexColor, weight: 2, dashArray: '4, 6', fillOpacity: 0.05 }).addTo(map);
  var waveCircle = L.circle([lat, lng], { radius: 0, color: hexColor, weight: 2.5, fillOpacity: 0.2 }).addTo(map);
  var dotIcon = L.divIcon({ html: '<div style="width:14px; height:14px; background:' + hexColor + '; border:2.5px solid #fff; border-radius:50%; box-shadow: 0 0 15px ' + hexColor + ';"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
  var marker = L.marker([lat, lng], { icon: dotIcon }).addTo(map);

  marker.bindPopup(
    '<div style="font-family:Inter, sans-serif;">' +
    '<h4 style="margin:0 0 5px 0; border-bottom:1px solid #333; padding-bottom:4px; color:' + hexColor + '">' + propName + ' Profile</h4>' +
    '<p style="margin:4px 0; font-size:0.85rem;"><b>Scenario LST:</b> <span style="font-weight:bold;">' + scenarioLst.toFixed(1) + '°C (' + riskClass + ')</span></p>' +
    '<p style="margin:4px 0; font-size:0.85rem;"><b>DUN:</b> ' + esc(props ? props.dun : 'n/a') + '</p>' +
    '<p style="margin:4px 0; font-size:0.85rem;"><b>Nearest record:</b> ' + nearestKm.toFixed(2) + ' km</p>' +
    '<button style="margin-top:8px; width:100%; padding:6px; background:var(--bg-color); color:var(--red); border:1px solid var(--border-color); border-radius:4px; cursor:pointer; font-weight:bold;" onclick="removeSite(\'' + id + '\')">Remove Site</button>' +
    '</div>'
  ).openPopup();

  var waveState = { r: 0, max: coverageRadiusMeters, circle: waveCircle, active: true };
  app.proposedSites[id] = { marker: marker, boundsCircle: boundsCircle, waveCircle: waveCircle, waveState: waveState, baseThermalScore: baseThermalScore, baseCoverageScore: baseCoverageScore };

  function animateWave() {
    if (!waveState.active) return;
    waveState.r += waveState.max / 80;
    if (waveState.r > waveState.max) waveState.r = 0;
    waveState.circle.setRadius(waveState.r);
    var fade = 1 - (waveState.r / waveState.max);
    waveState.circle.setStyle({ opacity: fade, fillOpacity: fade * 0.25 });
    requestAnimationFrame(animateWave);
  }
  animateWave();

  var cardHTML =
    '<div class="card" id="card-' + id + '" style="position:relative; margin-bottom:10px;">' +
    '<div id="score-badge-' + id + '" style="position:absolute; top:15px; right:15px; background:' + initialBadgeColor + '; color:#fff; font-weight:bold; padding:4px 10px; border-radius:6px; font-size:1.1rem; transition: background 0.3s;">' + initialFinalScore + '</div>' +
    '<h4 style="margin:0 0 2px 0; color:var(--text-main); font-size:1rem;">' + propName + '</h4>' +
    '<p style="font-size:0.75rem; color:var(--text-muted); margin:0 0 12px 0;">' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</p>' +
    '<div style="display:flex; gap:8px; margin-bottom:12px;">' +
    '<div style="background:rgba(255,255,255,0.05); border:1px solid var(--border-color); padding:8px; border-radius:6px; flex:1;"><span style="font-size:0.65rem; color:var(--text-muted); display:block;">Scenario LST</span><span style="font-weight:bold; font-size:0.9rem; color:' + hexColor + ';">' + scenarioLst.toFixed(1) + ' °C</span></div>' +
    '<div style="background:rgba(255,255,255,0.05); border:1px solid var(--border-color); padding:8px; border-radius:6px; flex:1;"><span style="font-size:0.65rem; color:var(--text-muted); display:block;">Nearest record</span><span style="font-weight:bold; font-size:0.9rem;">' + nearestKm.toFixed(2) + ' km</span></div>' +
    '<div style="background:rgba(255,255,255,0.05); border:1px solid var(--border-color); padding:8px; border-radius:6px; flex:1;"><span style="font-size:0.65rem; color:var(--text-muted); display:block;">Status</span><span id="status-text-' + id + '" style="font-weight:bold; font-size:0.8rem;">' + initialStatus + '</span></div>' +
    '</div>' +
    '<a href="#" style="color:var(--red); font-size:0.8rem; text-decoration:none; font-weight:bold;" onclick="removeSite(\'' + id + '\'); return false;">Remove</a>' +
    '</div>';
  var list = el('candidate-list');
  if (list) list.insertAdjacentHTML('beforeend', cardHTML);

  var count = Object.keys(app.proposedSites).length;
  setText('site-count-badge', count === 1 ? '1 site' : count + ' sites');
  var empty = el('empty-state');
  if (empty) empty.style.display = 'none';
  togglePlacementMode();
}

function removeSite(id) {
  var site = app.proposedSites[id];
  if (!site) return;
  site.waveState.active = false;
  map.removeLayer(site.marker);
  map.removeLayer(site.boundsCircle);
  map.removeLayer(site.waveCircle);
  delete app.proposedSites[id];
  var card = el('card-' + id);
  if (card) card.remove();
  var count = Object.keys(app.proposedSites).length;
  setText('site-count-badge', count === 1 ? '1 site' : count + ' sites');
  var empty = el('empty-state');
  if (empty) empty.style.display = count === 0 ? 'block' : 'none';
}

function parseCsv(text) {
  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;
  for (var i = 0; i < text.length; i += 1) {
    var ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (ch === '\r') {
      continue;
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseCsvRecords(text) {
  var rows = parseCsv(text);
  if (!rows.length) return [];
  var headers = rows[0].map(function (header) { return String(header).replace(/^\ufeff/, ''); });
  var columns = {
    dun: 'dun',
    parlimen: 'parlimen',
    district: 'klang_valley_uhvi_final_district',
    uhvi: 'UHVI_num',
    lst: 'klang_valley_uhvi_final__LSTbasemean',
    income: 'klang_valley_uhvi_final_income_median',
    elderly: 'klang_valley_uhvi_final_elderly_pct',
    green: 'green__deltaGreenmean',
    ind: 'ind__deltaIndmean'
  };
  var index = {};
  Object.keys(columns).forEach(function (key) { index[key] = headers.indexOf(columns[key]); });
  var records = [];
  for (var r = 1; r < rows.length; r += 1) {
    var row = rows[r];
    if (row.length < 2 && (row[0] === '' || row[0] === undefined)) continue;
    records.push({
      dun: index.dun >= 0 ? row[index.dun] : '',
      parlimen: index.parlimen >= 0 ? row[index.parlimen] : '',
      district: index.district >= 0 ? row[index.district] : '',
      uhvi: index.uhvi >= 0 ? row[index.uhvi] : '',
      lst: index.lst >= 0 ? row[index.lst] : '',
      income: index.income >= 0 ? row[index.income] : '',
      elderly: index.elderly >= 0 ? row[index.elderly] : '',
      green: index.green >= 0 ? row[index.green] : '',
      ind: index.ind >= 0 ? row[index.ind] : ''
    });
  }
  return records;
}

function filterCsvTable(query) {
  if (query === undefined || query === null) {
    var search = el('csv-search');
    query = search ? search.value : '';
  }
  var needle = String(query).toLowerCase().trim();
  var records = app.csvRecords.filter(function (record) {
    if (!needle) return true;
    return String(record.dun).toLowerCase().indexOf(needle) !== -1 ||
      String(record.parlimen).toLowerCase().indexOf(needle) !== -1 ||
      String(record.district).toLowerCase().indexOf(needle) !== -1;
  });
  renderCsvTable(records);
}

function renderCsvTable(records) {
  var wrap = el('csv-table-wrap');
  if (!wrap) return;
  var columns = [
    ['dun', 'DUN'],
    ['parlimen', 'Parliament'],
    ['district', 'District'],
    ['uhvi', 'UHVI'],
    ['lst', 'Mean LST'],
    ['income', 'Median income'],
    ['elderly', 'Elderly %'],
    ['green', 'deltaGreen'],
    ['ind', 'deltaInd']
  ];
  var html = '<div style="overflow:auto; max-height:460px; border:1px solid var(--border-color); border-radius:8px;"><table style="width:100%; border-collapse:collapse; font-size:0.72rem;">';
  html += '<thead><tr>';
  for (var c = 0; c < columns.length; c += 1) {
    html += '<th style="position:sticky; top:0; background:#0a0f1e; text-align:left; padding:8px; border-bottom:1px solid var(--border-color); white-space:nowrap;">' + columns[c][1] + '</th>';
  }
  html += '</tr></thead><tbody>';
  for (var r = 0; r < records.length; r += 1) {
    html += '<tr>';
    for (var k = 0; k < columns.length; k += 1) {
      var value = records[r][columns[k][0]];
      html += '<td style="padding:6px 8px; border-bottom:1px solid rgba(59,40,204,0.3); white-space:nowrap;">' + esc(value) + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  if (!records.length) html += '<p style="font-size:0.8rem; color:var(--text-muted); margin-top:10px;">No matching DUN rows.</p>';
  wrap.innerHTML = html;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}