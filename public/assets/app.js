const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const formatNumber = (value, digits = 0) => Number(value).toLocaleString("en-MY", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const formatClusterCount = (value) => value >= 1000 ? `${formatNumber(value / 1000, value >= 10000 ? 0 : 1)}k` : formatNumber(value);
const riskNames = ["Low", "Medium", "High"];
const riskColors = ["#30b9d9", "#f5c83a", "#e9573f"];
const temperaturePalette = ["#34215d", "#355fb8", "#2a9ddd", "#22cfbd", "#75e55f", "#dbea3b", "#ffb12b", "#f16a24", "#9f1f16"];
const exposurePalette = ["#edf8e9", "#c7e9c0", "#7fcdbb", "#41b6c4", "#f0c44a", "#e56a39", "#a32830"];
const presets = {
  all: { center: [3.1014, 101.6546], zoom: 11 },
  dbkl: { center: [3.139, 101.6869], zoom: 12 },
  mbsa: { center: [3.0738, 101.5183], zoom: 12 },
  mbpj: { center: [3.1073, 101.6067], zoom: 13 },
};

const state = {
  sites: [],
  grid: null,
  surfaceMatrix: null,
  summary: null,
  warming: 0,
  mitigation: 0,
  useModelDelta: false,
  gridMode: "baseline",
  opacity: 0.72,
  placing: false,
  selectingArea: false,
  drawingArea: false,
  suppressMapClick: false,
  areaBounds: null,
  selectedSite: null,
  thermalWeight: 60,
  candidates: [],
  proposalMarkers: new Map(),
};

let map;
let basemap;
let derivedSurfaceLayer;
let gridLayer;
let siteLayer;
let highlightCoverageLayer;
let proposalLayer;
let areaSelectionLayer;
let areaSelectionStart;
let areaSelectionPointerId = null;
let coverageIndex;
let selectedCoverageLayer;

const coverageBinSize = 0.02;
const pinMinimumZoom = 15; // Approximately the 300 m Leaflet scale in Klang Valley.

function riskForTemp(temp) {
  if (temp < 32) return 0;
  if (temp < 38) return 1;
  return 2;
}

function effectiveSiteTemp(site) {
  return site[3] + state.warming - state.mitigation + (state.useModelDelta ? site[5] : 0);
}

function effectiveGridTemp(properties) {
  const baseline = state.useModelDelta ? properties.model_scenario_lst_c : properties.mean_lst_c;
  return baseline + state.warming - state.mitigation;
}

function colorRamp(value, min, max, palette) {
  const t = clamp((value - min) / (max - min), 0, 0.9999);
  return palette[Math.floor(t * palette.length)];
}

function hexToRgb(hex) {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
}

const paletteCache = new Map();

function continuousColor(value, min, max, palette) {
  const position = clamp((value - min) / (max - min), 0, 1) * (palette.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(palette.length - 1, lowerIndex + 1);
  const blend = position - lowerIndex;
  if (!paletteCache.has(palette)) paletteCache.set(palette, palette.map(hexToRgb));
  const rgbPalette = paletteCache.get(palette);
  const lower = rgbPalette[lowerIndex];
  const upper = rgbPalette[upperIndex];
  return lower.map((channel, index) => Math.round(channel + (upper[index] - channel) * blend));
}

function bilinearValue(values, x, y, width, height) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const xBlend = x - x0;
  const yBlend = y - y0;
  const top = values[y0 * width + x0] * (1 - xBlend) + values[y0 * width + x1] * xBlend;
  const bottom = values[y1 * width + x0] * (1 - xBlend) + values[y1 * width + x1] * xBlend;
  return top * (1 - yBlend) + bottom * yBlend;
}

function createDerivedSurfaceUrl() {
  const matrix = state.surfaceMatrix;
  const width = 420;
  const height = Math.round(width * (matrix.bounds.north - matrix.bounds.south) / (matrix.bounds.east - matrix.bounds.west));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  const source = state.gridMode === "exposure" ? matrix.exposure : state.useModelDelta ? matrix.modelScenario : matrix.baseline;
  const adjustment = state.gridMode === "scenario" ? state.warming - state.mitigation : 0;
  const palette = state.gridMode === "exposure" ? exposurePalette : temperaturePalette;
  const min = state.gridMode === "exposure" ? 0 : 22;
  const max = state.gridMode === "exposure" ? 100 : 56;
  for (let pixelY = 0; pixelY < height; pixelY += 1) {
    const matrixY = (1 - pixelY / (height - 1)) * (matrix.height - 1);
    for (let pixelX = 0; pixelX < width; pixelX += 1) {
      const matrixX = (pixelX / (width - 1)) * (matrix.width - 1);
      const value = bilinearValue(source, matrixX, matrixY, matrix.width, matrix.height) + adjustment;
      const color = continuousColor(value, min, max, palette);
      const offset = (pixelY * width + pixelX) * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function gridStyle(feature) {
  return {
    stroke: false,
    fill: true,
    fillColor: "#000000",
    fillOpacity: 0.001,
  };
}

class TelecomCanvasLayer extends L.Layer {
  onAdd(targetMap) {
    this._map = targetMap;
    this._canvas = L.DomUtil.create("canvas", "telecom-canvas-layer");
    this._canvas.style.position = "absolute";
    this._canvas.style.pointerEvents = "none";
    targetMap.getPanes().overlayPane.appendChild(this._canvas);
    targetMap.on("moveend zoomend resize", this.redraw, this);
    this.redraw();
  }

  onRemove(targetMap) {
    L.DomUtil.remove(this._canvas);
    targetMap.off("moveend zoomend resize", this.redraw, this);
  }

  redraw() {
    if (!this._map || !this._canvas) return;
    const size = this._map.getSize();
    const ratio = window.devicePixelRatio || 1;
    this._canvas.width = size.x * ratio;
    this._canvas.height = size.y * ratio;
    this._canvas.style.width = `${size.x}px`;
    this._canvas.style.height = `${size.y}px`;
    const topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
    const context = this._canvas.getContext("2d");
    context.scale(ratio, ratio);
    this._renderItems = this.clusterVisibleSites(size);
    for (const item of this._renderItems) {
      if (item.sites.length > 1) this.drawCluster(context, item);
      else if (this._map.getZoom() >= pinMinimumZoom) this.drawSite(context, item);
      else this.drawDot(context, item);
    }
    context.globalAlpha = 1;
  }

  clusterVisibleSites(size) {
    const zoom = this._map.getZoom();
    const shouldCluster = zoom >= 11 && zoom < pinMinimumZoom;
    const cellSize = Math.max(30, 58 - (zoom - 9) * 4);
    const spatialBins = new Map();
    const clusters = [];
    for (const site of state.sites) {
      const point = this._map.latLngToContainerPoint([site[2], site[1]]);
      if (point.x < -cellSize || point.y < -cellSize || point.x > size.x + cellSize || point.y > size.y + cellSize) continue;
      const highlighted = state.areaBounds?.contains([site[2], site[1]]) ?? false;
      const selected = state.selectedSite === site;
      const risk = riskForTemp(effectiveSiteTemp(site));
      const xBin = Math.floor(point.x / cellSize);
      const yBin = Math.floor(point.y / cellSize);
      let cluster = null;
      let closestDistance = cellSize ** 2;
      if (shouldCluster && !selected) {
        for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
          for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
            const nearby = spatialBins.get(`${highlighted ? "in" : "out"}:${xBin + xOffset}:${yBin + yOffset}`) || [];
            for (const candidate of nearby) {
              const candidateX = candidate.x / candidate.sites.length;
              const candidateY = candidate.y / candidate.sites.length;
              const distance = (candidateX - point.x) ** 2 + (candidateY - point.y) ** 2;
              if (distance <= closestDistance) {
                cluster = candidate;
                closestDistance = distance;
              }
            }
          }
        }
      }
      if (!cluster) {
        cluster = {
          sites: [],
          x: 0,
          y: 0,
          lat: 0,
          lon: 0,
          highlighted,
          selected,
          riskCounts: [0, 0, 0],
          south: site[2],
          north: site[2],
          west: site[1],
          east: site[1],
        };
        clusters.push(cluster);
        if (shouldCluster) {
          const key = selected ? `selected:${site[0]}` : `${highlighted ? "in" : "out"}:${xBin}:${yBin}`;
          if (!spatialBins.has(key)) spatialBins.set(key, []);
          spatialBins.get(key).push(cluster);
        }
      }
      cluster.sites.push(site);
      cluster.x += point.x;
      cluster.y += point.y;
      cluster.lat += site[2];
      cluster.lon += site[1];
      cluster.riskCounts[risk] += 1;
      cluster.south = Math.min(cluster.south, site[2]);
      cluster.north = Math.max(cluster.north, site[2]);
      cluster.west = Math.min(cluster.west, site[1]);
      cluster.east = Math.max(cluster.east, site[1]);
    }
    return clusters.map((cluster) => {
      const count = cluster.sites.length;
      cluster.x /= count;
      cluster.y /= count;
      cluster.lat /= count;
      cluster.lon /= count;
      cluster.risk = cluster.riskCounts.lastIndexOf(Math.max(...cluster.riskCounts));
      cluster.radius = count > 1
        ? clamp(10 + Math.log10(count) * 4.5, 12, Math.min(24, cellSize / 2 - 2))
        : zoom >= pinMinimumZoom ? 8 : zoom >= 11 ? 2.5 : 1.55;
      return cluster;
    });
  }

  drawDot(context, item) {
    const radius = item.highlighted ? item.radius + 1.15 : item.radius;
    context.globalAlpha = state.areaBounds && !item.highlighted ? 0.18 : Math.min(0.92, state.opacity + 0.1);
    context.beginPath();
    context.arc(item.x, item.y, radius, 0, Math.PI * 2);
    context.fillStyle = riskColors[item.risk];
    context.fill();
    if (item.highlighted || item.selected || this._map.getZoom() >= 14) {
      context.strokeStyle = item.selected ? "#ffffff" : item.highlighted ? "rgba(255,255,255,.9)" : "rgba(14,31,28,.55)";
      context.lineWidth = item.selected ? 2.4 : item.highlighted ? 1.2 : 0.6;
      context.stroke();
    }
    if (item.selected) {
      context.globalAlpha = 1;
      context.beginPath();
      context.arc(item.x, item.y, radius + 5, 0, Math.PI * 2);
      context.strokeStyle = "#163f37";
      context.lineWidth = 2;
      context.stroke();
    }
  }

  drawSite(context, item) {
    const size = item.highlighted ? item.radius + 1 : item.radius;
    const tipY = item.y;
    const middleY = tipY - size * 1.2;
    context.globalAlpha = state.areaBounds && !item.highlighted ? 0.18 : Math.min(0.92, state.opacity + 0.1);
    context.beginPath();
    context.moveTo(item.x, tipY);
    context.bezierCurveTo(item.x - size * 0.3, tipY - size * 0.35, item.x - size, tipY - size * 0.75, item.x - size, middleY);
    context.bezierCurveTo(item.x - size, tipY - size * 1.85, item.x - size * 0.55, tipY - size * 2.25, item.x, tipY - size * 2.25);
    context.bezierCurveTo(item.x + size * 0.55, tipY - size * 2.25, item.x + size, tipY - size * 1.85, item.x + size, middleY);
    context.bezierCurveTo(item.x + size, tipY - size * 0.75, item.x + size * 0.3, tipY - size * 0.35, item.x, tipY);
    context.closePath();
    context.fillStyle = riskColors[item.risk];
    context.fill();
    context.strokeStyle = item.selected ? "#ffffff" : item.highlighted ? "rgba(255,255,255,.95)" : "rgba(14,31,28,.58)";
    context.lineWidth = item.selected ? 2 : item.highlighted ? 1.3 : 0.65;
    context.stroke();
    context.beginPath();
    context.arc(item.x, middleY, Math.max(1.1, size * 0.3), 0, Math.PI * 2);
    context.fillStyle = "rgba(255,255,255,.94)";
    context.fill();
    if (item.selected) {
      context.globalAlpha = 1;
      context.beginPath();
      context.arc(item.x, middleY, size + 4, 0, Math.PI * 2);
      context.strokeStyle = "#163f37";
      context.lineWidth = 2;
      context.stroke();
    }
  }

  drawCluster(context, item) {
    context.globalAlpha = state.areaBounds && !item.highlighted ? 0.25 : 0.96;
    context.beginPath();
    context.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
    context.fillStyle = riskColors[item.risk];
    context.fill();
    context.strokeStyle = item.highlighted ? "#ffffff" : "rgba(255,255,255,.92)";
    context.lineWidth = item.highlighted ? 3 : 2;
    context.stroke();
    context.globalAlpha = state.areaBounds && !item.highlighted ? 0.48 : 1;
    context.fillStyle = item.risk === 1 ? "#172423" : "#ffffff";
    context.font = `800 ${item.sites.length >= 1000 ? 9 : item.sites.length >= 100 ? 10 : 11}px Inter, system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(formatClusterCount(item.sites.length), item.x, item.y + 0.5);
  }

  nearestAt(containerPoint, radius = 8) {
    let best = null;
    let bestDistance = Infinity;
    for (const item of this._renderItems || []) {
      const isPin = item.sites.length === 1 && this._map.getZoom() >= pinMinimumZoom;
      const targetY = isPin ? item.y - item.radius * 1.2 : item.y;
      const distance = (item.x - containerPoint.x) ** 2 + (targetY - containerPoint.y) ** 2;
      const hitRadius = item.sites.length > 1 || isPin ? item.radius + 4 : radius;
      if (distance <= hitRadius ** 2 && distance < bestDistance) {
        best = item;
        bestDistance = distance;
      }
    }
    return best;
  }
}

function largestCoverageSite(bounds) {
  let largestSite = null;
  for (const site of state.sites) {
    if (!bounds.contains([site[2], site[1]])) continue;
    if (!largestSite || Number(site[6]) > Number(largestSite[6])) largestSite = site;
  }
  return largestSite;
}

class HighlightCoverageCanvasLayer extends L.Layer {
  onAdd(targetMap) {
    this._map = targetMap;
    this._canvas = L.DomUtil.create("canvas", "highlight-coverage-canvas");
    this._canvas.style.position = "absolute";
    this._canvas.style.pointerEvents = "none";
    targetMap.getPane("coverageAreaPane").appendChild(this._canvas);
    targetMap.on("moveend zoomend resize", this.redraw, this);
    this.redraw();
  }

  onRemove(targetMap) {
    L.DomUtil.remove(this._canvas);
    targetMap.off("moveend zoomend resize", this.redraw, this);
  }

  redraw() {
    if (!this._map || !this._canvas) return;
    const size = this._map.getSize();
    const ratio = window.devicePixelRatio || 1;
    this._canvas.width = size.x * ratio;
    this._canvas.height = size.y * ratio;
    this._canvas.style.width = `${size.x}px`;
    this._canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(this._canvas, this._map.containerPointToLayerPoint([0, 0]));
    const context = this._canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.x, size.y);
    const bounds = state.areaBounds;
    if (!bounds) return;

    const southWest = this._map.latLngToContainerPoint([bounds.getSouth(), bounds.getWest()]);
    const northEast = this._map.latLngToContainerPoint([bounds.getNorth(), bounds.getEast()]);
    const left = Math.min(southWest.x, northEast.x);
    const right = Math.max(southWest.x, northEast.x);
    const top = Math.min(southWest.y, northEast.y);
    const bottom = Math.max(southWest.y, northEast.y);
    const site = largestCoverageSite(bounds);
    if (!site) return;
    const center = this._map.latLngToContainerPoint([site[2], site[1]]);
    const radiusKm = Math.max(0, Number(site[6]) || 0) / 1000;
    const northPoint = this._map.latLngToContainerPoint([site[2] + radiusKm / 110.574, site[1]]);
    const radius = Math.max(1, Math.abs(center.y - northPoint.y));
    const risk = riskForTemp(effectiveSiteTemp(site));
    const [red, green, blue] = hexToRgb(riskColors[risk]);
    context.save();
    context.beginPath();
    context.rect(left, top, right - left, bottom - top);
    context.clip();
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fillStyle = `rgba(${red},${green},${blue},.14)`;
    context.fill();
    context.restore();
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.strokeStyle = riskColors[risk];
    context.lineWidth = 2;
    context.setLineDash([7, 5]);
    context.stroke();
  }
}

function initialiseMap() {
  map = L.map("map", { zoomControl: false, preferCanvas: true, minZoom: 9, maxZoom: 17 });
  map.createPane("smoothHeatPane");
  map.getPane("smoothHeatPane").style.zIndex = 350;
  map.getPane("smoothHeatPane").style.pointerEvents = "none";
  map.createPane("selectedCoveragePane");
  map.getPane("selectedCoveragePane").style.zIndex = 375;
  map.getPane("selectedCoveragePane").style.pointerEvents = "none";
  map.createPane("coverageAreaPane");
  map.getPane("coverageAreaPane").style.zIndex = 370;
  map.getPane("coverageAreaPane").style.pointerEvents = "none";
  L.control.zoom({ position: "topleft" }).addTo(map);
  L.control.scale({ position: "bottomright", imperial: false }).addTo(map);
  basemap = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  const studyBounds = [[state.summary.bounds.south, state.summary.bounds.west], [state.summary.bounds.north, state.summary.bounds.east]];
  map.fitBounds(studyBounds, { padding: [24, 24] });

  derivedSurfaceLayer = L.imageOverlay(createDerivedSurfaceUrl(), studyBounds, {
    opacity: state.opacity,
    interactive: false,
    pane: "smoothHeatPane",
    className: "derived-heat-overlay",
  });

  gridLayer = L.geoJSON(state.grid, {
    style: gridStyle,
    onEachFeature(feature, layer) {
      layer.on("click", () => inspectGrid(feature));
    },
  }).addTo(map);

  siteLayer = new TelecomCanvasLayer().addTo(map);
  highlightCoverageLayer = new HighlightCoverageCanvasLayer().addTo(map);
  proposalLayer = L.layerGroup().addTo(map);
  map.on("click", handleMapClick);
  const mapContainer = map.getContainer();
  mapContainer.addEventListener("pointerdown", startAreaSelection);
  mapContainer.addEventListener("pointermove", updateAreaSelection);
  mapContainer.addEventListener("pointerup", finishAreaSelection);
  mapContainer.addEventListener("pointercancel", cancelAreaSelectionGesture);
}

function syncSurfaceLayers() {
  if (!map || !gridLayer || !derivedSurfaceLayer) return;
  const visible = $("#show-grid")?.checked ?? true;
  if (!visible) {
    if (map.hasLayer(gridLayer)) gridLayer.remove();
    if (map.hasLayer(derivedSurfaceLayer)) derivedSurfaceLayer.remove();
    return;
  }
  if (!map.hasLayer(gridLayer)) gridLayer.addTo(map);
  derivedSurfaceLayer.setUrl(createDerivedSurfaceUrl());
  if (!map.hasLayer(derivedSurfaceLayer)) derivedSurfaceLayer.addTo(map);
}

function handleMapClick(event) {
  if (state.selectingArea || state.drawingArea || state.suppressMapClick) return;
  if (state.placing) {
    addCandidate(event.latlng);
    return;
  }
  if (!map.hasLayer(siteLayer)) return;
  const item = siteLayer.nearestAt(event.containerPoint, map.getZoom() >= 13 ? 10 : 7);
  if (!item) return;
  if (item.sites.length > 1) {
    if (map.getZoom() < map.getMaxZoom()) zoomIntoCluster(item);
    else inspectCluster(item);
    return;
  }
  inspectSite(item.sites[0]);
}

function zoomIntoCluster(cluster) {
  clearSelectedSite();
  $("#inspect-card").hidden = true;
  const nextZoom = Math.min(map.getMaxZoom(), map.getZoom() + 3);
  const hasExtent = cluster.north - cluster.south > 0.000001 || cluster.east - cluster.west > 0.000001;
  if (hasExtent) {
    map.fitBounds([[cluster.south, cluster.west], [cluster.north, cluster.east]], { padding: [70, 70], maxZoom: nextZoom });
  } else {
    map.setView([cluster.lat, cluster.lon], nextZoom);
  }
}

function setAreaSelectionMode(active) {
  if (!active) cancelAreaSelectionGesture();
  state.selectingArea = active;
  const button = $("#select-area");
  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", String(active));
  button.innerHTML = active ? '<span aria-hidden="true">×</span> Cancel selection' : '<span aria-hidden="true">▱</span> Select area';
  $("#area-hint").hidden = !active;
  map.dragging[active ? "disable" : "enable"]();
  $("#map").classList.toggle("area-selecting", active);
  if (active) {
    setPlacementMode(false);
    if (!map.hasLayer(siteLayer)) siteLayer.addTo(map);
    $("#show-sites").checked = true;
  }
}

function pointerLatLng(event) {
  const rect = map.getContainer().getBoundingClientRect();
  const point = L.point(
    clamp(event.clientX - rect.left, 0, rect.width),
    clamp(event.clientY - rect.top, 0, rect.height),
  );
  return map.containerPointToLatLng(point);
}

function startAreaSelection(event) {
  if (!state.selectingArea || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
  event.preventDefault();
  areaSelectionPointerId = event.pointerId;
  map.getContainer().setPointerCapture(event.pointerId);
  state.drawingArea = true;
  areaSelectionStart = pointerLatLng(event);
  const bounds = L.latLngBounds(areaSelectionStart, areaSelectionStart);
  if (areaSelectionLayer) areaSelectionLayer.setBounds(bounds);
  else areaSelectionLayer = L.rectangle(bounds, {
    color: "#163f37",
    weight: 2,
    opacity: 0.95,
    fillColor: "#30b9d9",
    fillOpacity: 0.18,
    dashArray: "7 5",
    interactive: false,
  }).addTo(map);
}

function updateAreaSelection(event) {
  if (!state.drawingArea || !areaSelectionStart || event.pointerId !== areaSelectionPointerId) return;
  event.preventDefault();
  areaSelectionLayer.setBounds(L.latLngBounds(areaSelectionStart, pointerLatLng(event)));
}

function finishAreaSelection(event) {
  if (!state.drawingArea || !areaSelectionStart || event.pointerId !== areaSelectionPointerId) return;
  event.preventDefault();
  const bounds = L.latLngBounds(areaSelectionStart, pointerLatLng(event));
  const mapContainer = map.getContainer();
  if (mapContainer.hasPointerCapture(event.pointerId)) mapContainer.releasePointerCapture(event.pointerId);
  state.drawingArea = false;
  areaSelectionPointerId = null;
  areaSelectionStart = null;
  state.suppressMapClick = true;
  setTimeout(() => { state.suppressMapClick = false; }, 0);
  setAreaSelectionMode(false);
  if (bounds.getNorth() === bounds.getSouth() || bounds.getEast() === bounds.getWest()) {
    clearAreaSelection();
    showToast("Drag across the map to select an area.");
    return;
  }
  areaSelectionLayer.setBounds(bounds);
  state.areaBounds = bounds;
  updateAreaSummary();
  siteLayer.redraw();
  highlightCoverageLayer?.redraw();
}

function cancelAreaSelectionGesture() {
  const wasDrawing = state.drawingArea;
  if (areaSelectionPointerId !== null) {
    const mapContainer = map?.getContainer();
    if (mapContainer?.hasPointerCapture(areaSelectionPointerId)) mapContainer.releasePointerCapture(areaSelectionPointerId);
  }
  areaSelectionPointerId = null;
  areaSelectionStart = null;
  state.drawingArea = false;
  if (wasDrawing && areaSelectionLayer) {
    if (state.areaBounds) areaSelectionLayer.setBounds(state.areaBounds);
    else {
      areaSelectionLayer.remove();
      areaSelectionLayer = null;
    }
  }
}

function clearAreaSelection() {
  setAreaSelectionMode(false);
  if (areaSelectionLayer) {
    areaSelectionLayer.remove();
    areaSelectionLayer = null;
  }
  state.areaBounds = null;
  $("#area-summary").hidden = true;
  siteLayer?.redraw();
  highlightCoverageLayer?.redraw();
}

function rectangleAreaKm2(bounds) {
  const center = bounds.getCenter();
  const width = haversine(center.lat, bounds.getWest(), center.lat, bounds.getEast());
  const height = haversine(bounds.getSouth(), center.lng, bounds.getNorth(), center.lng);
  return width * height;
}

function coverageBinKey(lat, lon) {
  return `${Math.floor(lat / coverageBinSize)}:${Math.floor(lon / coverageBinSize)}`;
}

function buildCoverageIndex() {
  coverageIndex = new Map();
  for (const site of state.sites) {
    const radiusKm = site[6] / 1000;
    const latDelta = radiusKm / 110.574;
    const lonDelta = radiusKm / (111.32 * Math.max(0.1, Math.cos(site[2] * Math.PI / 180)));
    const southBin = Math.floor((site[2] - latDelta) / coverageBinSize);
    const northBin = Math.floor((site[2] + latDelta) / coverageBinSize);
    const westBin = Math.floor((site[1] - lonDelta) / coverageBinSize);
    const eastBin = Math.floor((site[1] + lonDelta) / coverageBinSize);
    for (let latBin = southBin; latBin <= northBin; latBin += 1) {
      for (let lonBin = westBin; lonBin <= eastBin; lonBin += 1) {
        const key = `${latBin}:${lonBin}`;
        if (!coverageIndex.has(key)) coverageIndex.set(key, []);
        coverageIndex.get(key).push(site);
      }
    }
  }
}

function estimateCoveredAreaKm2(bounds, selectedSites, areaKm2) {
  if (!selectedSites.length || areaKm2 <= 0) return 0;
  if (!coverageIndex) buildCoverageIndex();
  const selectedIds = new Set(selectedSites.map((site) => site[0]));
  const widthKm = haversine(bounds.getCenter().lat, bounds.getWest(), bounds.getCenter().lat, bounds.getEast());
  const heightKm = haversine(bounds.getSouth(), bounds.getCenter().lng, bounds.getNorth(), bounds.getCenter().lng);
  const aspect = clamp(widthKm / Math.max(heightKm, 0.001), 0.2, 5);
  const columns = Math.max(18, Math.round(Math.sqrt(1800 * aspect)));
  const rows = Math.max(18, Math.round(Math.sqrt(1800 / aspect)));
  let covered = 0;
  for (let row = 0; row < rows; row += 1) {
    const lat = bounds.getSouth() + (row + 0.5) / rows * (bounds.getNorth() - bounds.getSouth());
    for (let column = 0; column < columns; column += 1) {
      const lon = bounds.getWest() + (column + 0.5) / columns * (bounds.getEast() - bounds.getWest());
      const candidates = coverageIndex.get(coverageBinKey(lat, lon)) || [];
      if (candidates.some((site) => selectedIds.has(site[0]) && haversine(lat, lon, site[2], site[1]) <= site[6] / 1000)) covered += 1;
    }
  }
  return areaKm2 * covered / (rows * columns);
}

function updateAreaSummary() {
  if (!state.areaBounds) return;
  const selectedSites = state.sites.filter((site) => state.areaBounds.contains([site[2], site[1]]));
  const largestSite = largestCoverageSite(state.areaBounds);
  const areaKm2 = rectangleAreaKm2(state.areaBounds);
  const coveredKm2 = estimateCoveredAreaKm2(state.areaBounds, largestSite ? [largestSite] : [], areaKm2);
  const coveragePercent = areaKm2 ? coveredKm2 / areaKm2 * 100 : 0;
  $("#area-tower-count").textContent = formatNumber(selectedSites.length);
  $("#area-size").textContent = `${formatNumber(areaKm2, areaKm2 < 10 ? 2 : 1)} km²`;
  $("#area-coverage").textContent = `${formatNumber(coveredKm2, coveredKm2 < 10 ? 2 : 1)} km²`;
  $("#area-coverage-note").textContent = largestSite
    ? `${formatNumber(coveragePercent, 0)}% of the selected area is covered by ${largestSite[0]}, the highlighted tower with the largest reported range (${formatNumber(largestSite[6] / 1000, 1)} km). Coverage is clipped to the selection.`
    : "No telecom towers are inside the selected area.";
  $("#area-summary").hidden = false;
}

function inspectGrid(feature) {
  clearSelectedSite();
  const p = feature.properties;
  const scenarioTemp = effectiveGridTemp(p);
  $("#inspect-type").textContent = "Thermal evidence cell";
  $("#inspect-title").textContent = p.cell_id;
  $("#inspect-details").innerHTML = `<div class="inspect-grid">
    <div><span>Baseline mean</span><strong>${p.mean_lst_c.toFixed(1)} °C</strong></div>
    <div><span>Scenario mean</span><strong>${scenarioTemp.toFixed(1)} °C</strong></div>
    <div><span>Scenario tier</span><strong>${riskNames[riskForTemp(scenarioTemp)]}</strong></div>
    <div><span>Exposure index</span><strong>${p.exposure_index}/100</strong></div>
    <div><span>Records</span><strong>${formatNumber(p.records)}</strong></div>
    <div><span>High-risk share</span><strong>${formatNumber(p.high_risk_share * 100, 0)}%</strong></div>
  </div>`;
  $("#inspect-card").hidden = false;
}

function inspectSite(site) {
  state.selectedSite = site;
  if (selectedCoverageLayer) selectedCoverageLayer.remove();
  selectedCoverageLayer = L.circle([site[2], site[1]], {
    pane: "selectedCoveragePane",
    radius: site[6],
    color: "#163f37",
    weight: 2,
    opacity: 0.9,
    fillColor: riskColors[riskForTemp(effectiveSiteTemp(site))],
    fillOpacity: 0.16,
    dashArray: "6 5",
    interactive: false,
  }).addTo(map);
  siteLayer.redraw();
  const scenarioTemp = effectiveSiteTemp(site);
  $("#inspect-type").textContent = "Selected telecom tower";
  $("#inspect-title").textContent = site[0];
  $("#inspect-details").innerHTML = `<div class="inspect-grid">
    <div><span>Baseline LST</span><strong>${site[3].toFixed(1)} °C</strong></div>
    <div><span>Scenario LST</span><strong>${scenarioTemp.toFixed(1)} °C</strong></div>
    <div><span>Scenario tier</span><strong>${riskNames[riskForTemp(scenarioTemp)]}</strong></div>
    <div><span>Radio / network</span><strong>${site[7]} · ${site[8]}</strong></div>
    <div><span>Reported range</span><strong>${formatNumber(site[6] / 1000, 1)} km</strong></div>
    <div><span>Samples</span><strong>${formatNumber(site[11])}</strong></div>
    <div><span>Coordinates</span><strong>${site[2].toFixed(4)}, ${site[1].toFixed(4)}</strong></div>
  </div>`;
  $("#inspect-card").hidden = false;
}

function inspectCluster(cluster) {
  clearSelectedSite();
  const radios = [...new Set(cluster.sites.map((site) => site[7]))].sort();
  const largestRange = Math.max(...cluster.sites.map((site) => site[6])) / 1000;
  $("#inspect-type").textContent = "Grouped telecom towers";
  $("#inspect-title").textContent = `${formatNumber(cluster.sites.length)} co-located records`;
  $("#inspect-details").innerHTML = `<div class="inspect-grid">
    <div><span>Low risk</span><strong>${formatNumber(cluster.riskCounts[0])}</strong></div>
    <div><span>Medium risk</span><strong>${formatNumber(cluster.riskCounts[1])}</strong></div>
    <div><span>High risk</span><strong>${formatNumber(cluster.riskCounts[2])}</strong></div>
    <div><span>Radio technologies</span><strong>${radios.join(" · ")}</strong></div>
    <div><span>Largest reported range</span><strong>${formatNumber(largestRange, 1)} km</strong></div>
    <div><span>Group centre</span><strong>${cluster.lat.toFixed(4)}, ${cluster.lon.toFixed(4)}</strong></div>
  </div>`;
  $("#inspect-card").hidden = false;
}

function clearSelectedSite() {
  state.selectedSite = null;
  if (selectedCoverageLayer) {
    selectedCoverageLayer.remove();
    selectedCoverageLayer = null;
  }
  siteLayer?.redraw();
}

function updateMetrics() {
  let high = 0;
  let sum = 0;
  for (const site of state.sites) {
    const temp = effectiveSiteTemp(site);
    sum += temp;
    if (riskForTemp(temp) === 2) high += 1;
  }
  const baselineHigh = state.summary.riskCounts.High;
  const change = high - baselineHigh;
  const mean = sum / state.sites.length;
  $("#metric-sites").textContent = formatNumber(state.sites.length);
  $("#metric-high").textContent = formatNumber(baselineHigh);
  $("#metric-high-share").textContent = `${formatNumber((baselineHigh / state.sites.length) * 100, 1)}% of portfolio`;
  $("#metric-mean").textContent = `${state.summary.baseline.mean.toFixed(1)}°`;
  const priorityCells = state.grid.features.filter((feature) => feature.properties.exposure_priority !== "Watch").length;
  $("#metric-grid").textContent = formatNumber(priorityCells);
  $("#scenario-high").textContent = formatNumber(high);
  $("#scenario-change").textContent = `${change >= 0 ? "+" : ""}${formatNumber(change)}`;
  $("#scenario-change").style.color = change > 0 ? "#c84737" : change < 0 ? "#2f6d5f" : "inherit";
  $("#scenario-mean").textContent = `${mean.toFixed(1)} °C`;
}

function updateScenario() {
  state.warming = Number($("#warming").value);
  state.mitigation = Number($("#mitigation").value);
  state.useModelDelta = $("#model-delta").checked;
  const net = state.warming - state.mitigation;
  $("#warming-output").textContent = `${state.warming >= 0 ? "+" : ""}${state.warming.toFixed(1)} °C`;
  $("#mitigation-output").textContent = `${state.mitigation.toFixed(1)} °C`;
  $("#net-delta").textContent = `${net >= 0 ? "+" : ""}${net.toFixed(1)} °C`;
  $("#scenario-caption").textContent = state.useModelDelta ? "Regional + mitigation + local supplied model" : net === 0 ? "Baseline conditions" : "Regional heat less cooling intervention";
  updateMetrics();
  gridLayer?.setStyle(gridStyle);
  if (derivedSurfaceLayer && state.gridMode !== "baseline") derivedSurfaceLayer.setUrl(createDerivedSurfaceUrl());
  siteLayer?.redraw();
  highlightCoverageLayer?.redraw();
  recalculateCandidates();
}

function updateMapMode() {
  state.gridMode = $("#grid-mode").value;
  const copy = {
    baseline: ["Continuous source surface", "Baseline land-surface temperature", "PDF raster · 22.07–53.64 °C · exact values remain available by inspection"],
    scenario: ["Predictive scenario", "Smoothed scenario land-surface temperature", "Continuous rendering · thresholds: Low <32 °C · Medium 32–<38 °C · High ≥38 °C"],
    exposure: ["Public-health screening", "Smoothed thermal exposure index", "Continuous display · demographic vulnerability and adaptive capacity are not included"],
  }[state.gridMode];
  $("#map-eyebrow").textContent = copy[0];
  $("#map-title").textContent = copy[1];
  $("#map-subtitle").textContent = copy[2];
  gridLayer.setStyle(gridStyle);
  syncSurfaceLayers();
  renderLegend();
}

function renderLegend() {
  if (state.gridMode === "baseline") {
    $("#map-legend").innerHTML = `<h3>Baseline LST (°C)</h3><div class="gradient-bar baseline-gradient"></div><div class="gradient-labels"><span>22.1</span><span>32</span><span>38</span><span>53.6</span></div>`;
  } else if (state.gridMode === "scenario") {
    $("#map-legend").innerHTML = `<h3>Scenario LST (°C)</h3><div class="gradient-bar baseline-gradient"></div><div class="gradient-labels"><span>22</span><span>32 · Low</span><span>38 · High</span><span>56</span></div>`;
  } else {
    $("#map-legend").innerHTML = `<h3>Thermal exposure index</h3><div class="gradient-bar exposure-gradient"></div><div class="gradient-labels"><span>0</span><span>50 · Elevated</span><span>70 · Critical</span><span>100</span></div>`;
  }
  $("#map-legend").insertAdjacentHTML("beforeend", `<div class="cluster-legend"><i>12</i><span>Groups appear on zoom · pins at the 300 m scale</span></div>`);
}

function setPlacementMode(active) {
  if (active && state.selectingArea) setAreaSelectionMode(false);
  state.placing = active;
  $("#place-site").textContent = active ? "Cancel placement" : "Place proposed site";
  $("#place-site").classList.toggle("secondary-button", active);
  $("#place-site").classList.toggle("primary-button", !active);
  $("#place-hint").textContent = active ? "Placement mode is on — click any map location." : "Placement mode is off.";
  $("#map").style.cursor = active ? "crosshair" : "";
}

function haversine(aLat, aLon, bLat, bLon) {
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function estimateLocation(lat, lon) {
  const nearest = [];
  for (const site of state.sites) {
    const distance = haversine(lat, lon, site[2], site[1]);
    if (nearest.length < 12 || distance < nearest[nearest.length - 1].distance) {
      nearest.push({ distance, site });
      nearest.sort((a, b) => a.distance - b.distance);
      if (nearest.length > 12) nearest.pop();
    }
  }
  let weightedTemp = 0;
  let weights = 0;
  for (const item of nearest) {
    const weight = 1 / Math.max(item.distance, 0.05);
    weightedTemp += effectiveSiteTemp(item.site) * weight;
    weights += weight;
  }
  return { nearestKm: nearest[0]?.distance ?? 0, estimatedTemp: weightedTemp / weights };
}

function scoreCandidate(candidate) {
  const estimate = estimateLocation(candidate.lat, candidate.lon);
  candidate.nearestKm = estimate.nearestKm;
  candidate.scenarioTemp = estimate.estimatedTemp;
  candidate.thermalScore = clamp(((42 - candidate.scenarioTemp) / 14) * 100, 0, 100);
  candidate.coverageScore = clamp((candidate.nearestKm / 3) * 100, 0, 100);
  candidate.score = (candidate.thermalScore * state.thermalWeight + candidate.coverageScore * (100 - state.thermalWeight)) / 100;
  candidate.status = candidate.score >= 70 ? "Recommend for study" : candidate.score >= 45 ? "Conditional review" : "Hold / redesign";
}

function addCandidate(latlng) {
  if (state.candidates.length >= 12) {
    showToast("Candidate limit reached (12). Export or remove a site first.");
    return;
  }
  const candidate = { id: `PROP-${String(state.candidates.length + 1).padStart(2, "0")}`, lat: latlng.lat, lon: latlng.lng };
  scoreCandidate(candidate);
  state.candidates.push(candidate);
  renderCandidates();
  setPlacementMode(false);
  switchTab("approval");
  showToast(`${candidate.id} added to the approval register.`);
}

function recalculateCandidates() {
  for (const candidate of state.candidates) scoreCandidate(candidate);
  renderCandidates();
}

function renderCandidates() {
  $("#candidate-count").textContent = `${state.candidates.length} ${state.candidates.length === 1 ? "site" : "sites"}`;
  $("#export-csv").disabled = state.candidates.length === 0;
  $("#export-memo").disabled = state.candidates.length === 0;
  proposalLayer?.clearLayers();
  if (!state.candidates.length) {
    $("#candidate-list").innerHTML = `<div class="empty-state"><span>＋</span><strong>No proposed sites</strong><p>Use Scenario lab → Place proposed site, then click the map.</p></div>`;
    return;
  }
  $("#candidate-list").innerHTML = state.candidates.map((candidate) => {
    const badgeClass = candidate.score >= 70 ? "" : candidate.score >= 45 ? "conditional" : "hold";
    return `<article class="candidate-item">
      <div class="candidate-head"><div><h3>${candidate.id}</h3><p>${candidate.lat.toFixed(5)}, ${candidate.lon.toFixed(5)}</p></div><span class="score-badge ${badgeClass}">${candidate.score.toFixed(0)}</span></div>
      <div class="candidate-stats"><div><span>Scenario LST</span><strong>${candidate.scenarioTemp.toFixed(1)} °C</strong></div><div><span>Nearest record</span><strong>${candidate.nearestKm.toFixed(2)} km</strong></div><div><span>Status</span><strong>${candidate.status}</strong></div></div>
      <button class="candidate-remove" data-remove="${candidate.id}" aria-label="Remove ${candidate.id} from candidate register">Remove</button>
    </article>`;
  }).join("");
  $$('[data-remove]').forEach((button) => button.addEventListener("click", () => {
    state.candidates = state.candidates.filter((candidate) => candidate.id !== button.dataset.remove);
    renderCandidates();
  }));
  state.candidates.forEach((candidate) => {
    const icon = L.divIcon({ className: "", html: `<div class="proposal-marker"><span>${candidate.id.slice(-2)}</span></div>`, iconSize: [28, 28], iconAnchor: [14, 28] });
    L.marker([candidate.lat, candidate.lon], { icon }).bindTooltip(`${candidate.id} · score ${candidate.score.toFixed(0)}`).addTo(proposalLayer);
  });
}

function exportCsv() {
  const header = ["candidate_id", "latitude", "longitude", "scenario_lst_c", "nearest_record_km", "thermal_score", "coverage_gap_score", "composite_score", "screening_status"];
  const rows = state.candidates.map((c) => [c.id, c.lat.toFixed(6), c.lon.toFixed(6), c.scenarioTemp.toFixed(2), c.nearestKm.toFixed(3), c.thermalScore.toFixed(1), c.coverageScore.toFixed(1), c.score.toFixed(1), c.status]);
  downloadText("municipal_candidate_register.csv", [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"), "text/csv");
}

function exportMemo() {
  const rows = state.candidates.map((c) => `<tr><td>${c.id}</td><td>${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}</td><td>${c.scenarioTemp.toFixed(1)} °C</td><td>${c.nearestKm.toFixed(2)} km</td><td>${c.score.toFixed(0)}/100</td><td>${c.status}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Municipal screening memo</title><style>body{max-width:900px;margin:40px auto;font:14px Arial;color:#172423}h1,h2{font-family:Georgia}small{color:#687371}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:9px;border:1px solid #ccd2cd;text-align:left}th{background:#e7eee9}li{margin:7px 0}.notice{padding:14px;background:#fff3d4;border-left:5px solid #d39a21}@media print{body{margin:12mm}}</style></head><body><small>PHASE 6 · PRELIMINARY DECISION SUPPORT</small><h1>Municipal proposed-site screening memo</h1><p>Generated ${new Date().toLocaleString("en-MY")}. Scenario: regional ${state.warming >= 0 ? "+" : ""}${state.warming.toFixed(1)} °C; cooling ${state.mitigation.toFixed(1)} °C; supplied local delta ${state.useModelDelta ? "included" : "excluded"}. Weighting: thermal resilience ${state.thermalWeight}%; coverage gap ${100 - state.thermalWeight}%.</p><table><thead><tr><th>ID</th><th>Coordinate</th><th>Scenario LST</th><th>Nearest supplied record</th><th>Score</th><th>Screening status</th></tr></thead><tbody>${rows}</tbody></table><div class="notice"><strong>Decision limitation</strong><p>This memo is not planning permission. Scores use modelled land-surface temperature and proximity to supplied telecom records only.</p></div><h2>Mandatory gates before recommendation</h2><ul><li>Zoning, development-plan consistency, and land tenure</li><li>RF coverage, structural design, power and backhaul feasibility</li><li>Environmental, heritage, drainage and emergency-access screening</li><li>Demographic vulnerability, accessibility and distributive-equity review</li><li>Relevant agency, utility, landowner and community consultation</li></ul></body></html>`;
  downloadText("municipal_screening_memo.html", html, "text/html");
}

function downloadText(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function switchTab(name) {
  $$(".tab").forEach((tab) => {
    const active = tab.dataset.panel === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-current", active ? "page" : "false");
  });
  $$(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === `panel-${name}`));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 2600);
}

function setupFeedback() {
  const responses = JSON.parse(localStorage.getItem("heat-dashboard-feedback") || "[]");
  const updateCount = () => { $("#feedback-count").textContent = `${responses.length} saved ${responses.length === 1 ? "response" : "responses"}`; };
  updateCount();
  $("#feedback-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    responses.push({ ...data, recordedAt: new Date().toISOString(), release: "phase6-v1.1.0" });
    localStorage.setItem("heat-dashboard-feedback", JSON.stringify(responses));
    event.target.reset();
    updateCount();
    showToast("Feedback saved locally. Export it before clearing this browser.");
  });
  $("#export-feedback").addEventListener("click", () => downloadText("dashboard_feedback_log.json", JSON.stringify({ exportedAt: new Date().toISOString(), responses }, null, 2), "application/json"));
}

function bindControls() {
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.panel)));
  $("#warming").addEventListener("input", updateScenario);
  $("#mitigation").addEventListener("input", updateScenario);
  $("#model-delta").addEventListener("change", updateScenario);
  $("#reset-scenario").addEventListener("click", () => {
    $("#warming").value = 0;
    $("#mitigation").value = 0;
    $("#model-delta").checked = false;
    updateScenario();
  });
  $("#grid-mode").addEventListener("change", updateMapMode);
  $("#opacity").addEventListener("input", (event) => {
    state.opacity = Number(event.target.value) / 100;
    $("#opacity-output").textContent = `${event.target.value}%`;
    derivedSurfaceLayer.setOpacity(state.opacity);
    gridLayer.setStyle(gridStyle);
    siteLayer.redraw();
  });
  $("#show-grid").addEventListener("change", syncSurfaceLayers);
  $("#show-sites").addEventListener("change", (event) => event.target.checked ? siteLayer.addTo(map) : siteLayer.remove());
  $("#show-basemap").addEventListener("change", (event) => event.target.checked ? basemap.addTo(map) : basemap.remove());
  $("#reset-map").addEventListener("click", () => map.fitBounds([[state.summary.bounds.south, state.summary.bounds.west], [state.summary.bounds.north, state.summary.bounds.east]], { padding: [24, 24] }));
  $("#view-preset").addEventListener("change", (event) => map.flyTo(presets[event.target.value].center, presets[event.target.value].zoom));
  $("#place-site").addEventListener("click", () => setPlacementMode(!state.placing));
  $("#select-area").addEventListener("click", () => setAreaSelectionMode(!state.selectingArea));
  $("#clear-area").addEventListener("click", clearAreaSelection);
  $("#thermal-weight").addEventListener("input", (event) => {
    state.thermalWeight = Number(event.target.value);
    $("#thermal-weight-output").textContent = `${state.thermalWeight}%`;
    $("#coverage-weight").textContent = `${100 - state.thermalWeight}%`;
    recalculateCandidates();
  });
  $("#export-csv").addEventListener("click", exportCsv);
  $("#export-memo").addEventListener("click", exportMemo);
  $("#close-inspect").addEventListener("click", () => {
    $("#inspect-card").hidden = true;
    clearSelectedSite();
  });
  $("#open-baseline").addEventListener("click", () => $("#baseline-dialog").showModal());
  $("#open-uhvi").addEventListener("click", () => $("#uhvi-dialog").showModal());
  $("#help-button").addEventListener("click", () => $("#help-dialog").showModal());
  $("#open-feedback").addEventListener("click", () => $("#feedback-dialog").showModal());
  setupFeedback();
}

async function initialise() {
  try {
    const [siteResponse, gridResponse, summaryResponse, surfaceResponse] = await Promise.all([
      fetch("data/sites.json"),
      fetch("data/heat_exposure_grid.geojson"),
      fetch("data/summary.json"),
      fetch("data/surface_matrix.json"),
    ]);
    if (!siteResponse.ok || !gridResponse.ok || !summaryResponse.ok || !surfaceResponse.ok) throw new Error("A dashboard data file could not be loaded.");
    const siteData = await siteResponse.json();
    state.sites = siteData.rows;
    state.grid = await gridResponse.json();
    state.summary = await summaryResponse.json();
    state.surfaceMatrix = await surfaceResponse.json();
    initialiseMap();
    bindControls();
    updateMetrics();
    updateScenario();
    updateMapMode();
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `<main style="max-width:720px;margin:70px auto;padding:24px;font:16px system-ui"><h1>Dashboard data did not load</h1><p>${error.message}</p><p>Run <code>npm run build:data</code>, then start this project through the included local server with <code>npm start</code>. Opening index.html directly is not supported because browsers block local data requests.</p></main>`;
  }
}

initialise();
