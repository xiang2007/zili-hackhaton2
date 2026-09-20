# Navi — Heat Distribution Analysis

A municipal heat-vulnerability dashboard for Klang Valley. It connects the supplied
geospatial datasets (UHVI districts, land-surface temperature, income, elderly share,
green/industrial deltas) to a Leaflet web UI, and folds in OpenCelliD cell-tower
locations as a telecom-infrastructure exposure layer.

OpenCelliD data is fetched **once per month** and cached — it is not queried live.

## Stack

- **Node.js + Express** (only runtime dependency is `express`)
- Vanilla ES browser app with **Leaflet 1.9.4**, `leaflet.heat`, `leaflet.markercluster` (CDN)
- No build step, no frontend framework

## Requirements

- Node.js **>= 22.9** (the npm scripts use `--env-file-if-exists`)
- An OpenCelliD API token for the monthly cell fetch
  (free signup: <https://opencellid.org>)

## Setup

```bash
npm install
cp .env.example .env      # then set OPENCELLID_API_KEY
```

`.env`:

```dotenv
PORT=3000
OPENCELLID_API_KEY=your_token_here
REFRESH_INTERVAL_DAYS=30
```

`OPENCELLID_CSV_PATH` is optional — point it at a manually downloaded
`502.csv.gz` to build the cache without hitting the download API.

## Run

```bash
npm start          # http://localhost:3000
npm run dev        # same, with --watch auto-reload
```

- Dashboard: <http://localhost:3000/>
- Login page: <http://localhost:3000/login>

The server starts even without an API key: the site loads and the cell layer is
simply empty until a cache exists.

## OpenCelliD monthly refresh

The cell layer is built from OpenCelliD's Malaysia bulk export
(`https://opencellid.org/ocid/downloads?...&file=502.csv.gz`), filtered to the
Klang Valley bounding box `[101.21684, 2.72712, 101.96982, 3.40856]`, then each
cell is assigned to its containing DUN and classified by that DUN's mean LST:

| Tier   | Mean LST      |
| ------ | ------------- |
| Low    | `< 32 °C`     |
| Medium | `32–38 °C`    |
| High   | `>= 38 °C`    |

Cells outside the 44 supplied DUN polygons have no LST/risk tier and render grey.

Refresh policy:

- On server start, refresh if the cache is missing or past `next_refresh_at`.
- Then poll every 6 hours and refresh when stale.
- `REFRESH_INTERVAL_DAYS` (default `30`) sets `next_refresh_at = fetched_at + N days`.

Manual refresh:

```bash
npm run fetch:cells
# or build from a local file to avoid the API's 2 downloads/file/day limit:
node --env-file-if-exists=.env scripts/fetch-opencellid.js --file=/path/to/502.csv.gz
```

Generated cache files (committed so a fresh clone works offline):

```
data/opencellid/cells.json              # { meta, fields, cells }
data/opencellid/meta.json               # fetch metadata + next_refresh_at
data/opencellid/telecom_sites.geojson   # point FeatureCollection
```

## API

| Method | Path                   | Returns |
| ------ | ---------------------- | ------- |
| GET    | `/api/health`          | `{ ok: true }` |
| GET    | `/api/meta`            | dataset bounds, PNG overlay bounds, cache meta, thresholds |
| GET    | `/api/geojson`         | raw `dashboard_data_v3.geojson` |
| GET    | `/api/csv`             | raw `uhvi_dun_v3.csv` |
| GET    | `/api/cells`           | `{ meta, fields, cells }` |
| GET    | `/api/cells/meta`      | cache metadata only |
| POST   | `/api/cells/refresh`   | triggers a refresh |

`cells` rows are arrays ordered as:
`["radio","mnc","lac","cell","lon","lat","range","samples","lst","risk","dun"]`.

## Project layout

```
server.js                     Express app + API + static hosting
src/geo.js                    point-in-polygon / bounds helpers
src/opencellid.js             download, filter, DUN-assign, cache
src/scheduler.js              monthly staleness check + refresh
scripts/fetch-opencellid.js   CLI refresh
public/index.html             dashboard
public/app.js                 dashboard logic
public/login.html             login screen
data/dashboard_data_v3.geojson  44 DUN polygons + UHVI/LST/income attributes
data/uhvi_dun_v3.csv            district table
data/UHVI_Klang_Valley_v2_2.png reference map export
data/phase6_telecom_heat_risk.ipynb  OpenCelliD sampling + risk pipeline
data/phase7_web_export.ipynb         web data contract
```

## Data layers in the UI

- **UHVI districts** — choropleth from the GeoJSON, coloured by `UHVI_num`.
- **Telecom nodes** — OpenCelliD cells, clustered; colour by thermal risk tier or radio type.
- **Heat surface** — density heatmap weighted by risk.
- **Reference map** — the supplied PNG as an approximate georeferenced overlay (off by default).
- **Scenario lab** — regional warming / cooling sliders recompute risk across all cells;
  place a proposed site to score thermal suitability vs. coverage gap.
- **Data tab** — searchable `uhvi_dun_v3.csv` table and downloads.

## Attribution & license

Cell data: **© OpenCelliD, CC BY-SA 4.0** (<https://opencellid.org>) — shown in the
dashboard UI. Basemap tiles © OpenStreetMap contributors.

## Caveats

- The PNG overlay bounds are approximate; it is a rendered map export, not a survey raster.
- OpenCelliD is crowd-sourced and not an official tower inventory — treat it as an
  indicative proxy for where thermal risk concentrates.
- Site scores are screening aids only and do not replace planning permission,
  engineering design, or public-health review.
