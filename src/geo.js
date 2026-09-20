'use strict';

function ringBbox(ring) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const lon = ring[i][0];
    const lat = ring[i][1];
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

function buildIndex(geojson) {
  const index = [];
  const features = geojson && geojson.features ? geojson.features : [];
  for (let f = 0; f < features.length; f += 1) {
    const feature = features[f];
    const geometry = feature.geometry;
    const rings = [];
    if (geometry) {
      const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
      for (let p = 0; p < polygons.length; p += 1) {
        const polygon = polygons[p];
        for (let r = 0; r < polygon.length; r += 1) {
          const ring = polygon[r];
          rings.push({ ring, bbox: ringBbox(ring), poly: p, hole: r > 0 });
        }
      }
    }
    index.push({ props: feature.properties, rings });
  }
  return index;
}

function bboxContains(bbox, lon, lat) {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const crosses = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInEntry(lon, lat, entry) {
  const polygons = new Map();
  for (let i = 0; i < entry.rings.length; i += 1) {
    const item = entry.rings[i];
    if (!bboxContains(item.bbox, lon, lat)) continue;
    if (!polygons.has(item.poly)) polygons.set(item.poly, []);
    polygons.get(item.poly).push(item);
  }
  for (const rings of polygons.values()) {
    let inside = false;
    for (let i = 0; i < rings.length; i += 1) {
      const item = rings[i];
      const hit = pointInRing(lon, lat, item.ring);
      if (item.hole) {
        if (hit) inside = false;
      } else if (hit) {
        inside = true;
      }
    }
    if (inside) return true;
  }
  return false;
}

function locate(index, lon, lat) {
  for (let i = 0; i < index.length; i += 1) {
    if (pointInEntry(lon, lat, index[i])) return index[i].props;
  }
  return null;
}

function bounds(geojson) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  const features = geojson && geojson.features ? geojson.features : [];
  for (let f = 0; f < features.length; f += 1) {
    const geometry = features[f].geometry;
    if (!geometry) continue;
    const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
    for (let p = 0; p < polygons.length; p += 1) {
      for (let r = 0; r < polygons[p].length; r += 1) {
        const ring = polygons[p][r];
        for (let i = 0; i < ring.length; i += 1) {
          const lon = ring[i][0];
          const lat = ring[i][1];
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

function centroid(props, index) {
  if (!props || !index) return null;
  for (let i = 0; i < index.length; i += 1) {
    const entry = index[i];
    if (entry.props && entry.props.fid === props.fid) {
      let sumLon = 0;
      let sumLat = 0;
      let count = 0;
      for (let r = 0; r < entry.rings.length; r += 1) {
        const ring = entry.rings[r].ring;
        for (let j = 0; j < ring.length; j += 1) {
          sumLon += ring[j][0];
          sumLat += ring[j][1];
          count += 1;
        }
      }
      if (count === 0) return null;
      return [sumLon / count, sumLat / count];
    }
  }
  return null;
}

module.exports = {
  buildIndex,
  locate,
  pointInDun: locate,
  bounds,
  centroid,
  ringBbox,
  pointInRing
};
