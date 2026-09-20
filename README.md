# Navi | HEAT DISTRIBUTION ANALYSIS

A municipal heat-risk decision dashboard for Klang Valley, served by a small
Node.js/Express backend. The UI is the **Navi | HEAT DISTRIBUTION ANALYSIS** layout
(ported from the [`zili-hackathon`](https://github.com/xiang2007/zili-hackathon)
dashboard); the heat layer is a **continuous raster surface**, and the telecom
cells come from a **monthly-cached OpenCelliD** pull.

OpenCelliD data is fetched **once per month** and cached — it is not queried live.

## Stack

- **Node.js + Express** (only runtime dependency is `express`)
- Browser app: vanilla ES module + **Leaflet 1.9.4** (vendored under
  `public/assets/vendor/`, no CDN)
- No build step for the UI

## Requirements

- Node.js **>= 18.17** (Node 18 uses the built-in JSON auth fallback; Node 22+ uses SQLite when `node:sqlite` is available)
- An OpenCelliD API token for the monthly cell fetch
  (free signup: <https://opencellid.org>)

## Setup

```bash
npm install
cp .env.example .env      # then set OPENCELLID_API_KEY
```

`.env` is gitignored, so a fresh clone needs this step. `.env` is loaded by the app
itself (`src/env.js`), so no special Node flags are required.

`.env`:

```dotenv
PORT=3000
OPENCELLID_API_KEY=your_token_here
REFRESH_INTERVAL_DAYS=30
```

`OPENCELLID_CSV_PATH` is optional — point it at a manually downloaded `502.csv.gz`
to build the cache without hitting the download API.

## Run

```bash
npm start          # http://localhost:3000
npm run dev        # same, with --watch auto-reload
```

The server starts even without an API key: the site loads from the committed
dashboard data, and the monthly refresh is skipped.

## How the data fits together

```
OpenCelliD 502.csv.gz ──► data/opencellid/cells.json   (monthly cache)
dashboard_data_v6_kl.geojson ─┐
                              ├─► scripts/build-dashboard-data.js
cells.json ────────────────┘        │
                                    ▼
        data/sites.json                    telecom observations (45,660)
        data/heat_exposure_grid.geojson    0.01° evidence grid
        data/surface_matrix.json           64×52 smoothed surface
        data/summary.json                  bounds / stats / counts
        data/telecom_heat_risk.csv         processed source export
        data/uhvi_areas_v6.csv             56-area UHVI table
```

The UI also fetches `data/dashboard_data_v6_kl.geojson`. The heat surface is
rendered client-side from the matrix (canvas → image overlay); switching between
**Baseline / Scenario / Exposure** recolours it. **UHVI** displays the five-class,
inspectable constituency choropleth. The **Telecom cells** toggle draws the cached
observations as a canvas point layer coloured by thermal risk.

Rebuild the dashboard data at any time:

```bash
npm run build:data
```

## OpenCelliD monthly refresh

- Source: OpenCelliD Malaysia bulk export (MCC 502),
  `https://opencellid.org/ocid/downloads?token=<KEY>&type=mcc&file=502.csv.gz`
- Filtered to the Klang Valley bounding box, then each cell is assigned to its
  containing v6 constituency (or the nearest area outside the supplied polygons)
  and classified by that area's mean LST:
  Low `< 32 °C`, Medium `32–38 °C`, High `>= 38 °C`.
- Refresh policy: on server start, refresh if the cache is missing or past
  `next_refresh_at`; then poll every 6 hours. `REFRESH_INTERVAL_DAYS` (default 30)
  sets `next_refresh_at = fetched_at + N days`.
- After every refresh the dashboard data files above are regenerated automatically.

Manual refresh:

```bash
npm run fetch:cells
# or build from a local file to avoid the API's 2 downloads/file/day limit:
node scripts/fetch-opencellid.js --file=/path/to/502.csv.gz
```

## API

| Method | Path                   | Returns |
| ------ | ---------------------- | ------- |
| GET    | `/api/health`          | `{ ok: true }` |
| GET    | `/api/meta`            | dataset bounds, PNG bounds, cache meta, thresholds |
| GET    | `/api/geojson`         | raw `dashboard_data_v6_kl.geojson` |
| GET    | `/api/csv`             | generated `uhvi_areas_v6.csv` |
| GET    | `/api/cells`           | `{ meta, fields, cells }` |
| GET    | `/api/cells/meta`      | cache metadata only |
| POST   | `/api/cells/refresh`   | refresh the cache and rebuild dashboard data |

`cells` rows are arrays ordered as:
`["radio","mnc","lac","cell","lon","lat","range","samples","lst","risk","dun"]`.

## Project layout

```
server.js                        Express app + API + static hosting
src/env.js                       .env loader
src/geo.js                       point-in-polygon / bounds helpers
src/opencellid.js                download, filter, DUN-assign, cache
src/dashboard-data.js            build sites/grid/surface/summary from the cache
src/scheduler.js                 monthly staleness check + refresh + rebuild
scripts/fetch-opencellid.js      CLI refresh
scripts/build-dashboard-data.js  CLI dashboard-data build
public/index.html                Navi heat distribution analysis UI
public/assets/app.js             dashboard logic (module)
public/assets/app.css            light theme
public/assets/vendor/            Leaflet
public/docs/                     handoff documents
public/presentation.html         print-ready stakeholder deck
data/dashboard_data_v6_kl.geojson  56 constituency polygons + UHVI/LST/demographic attributes
data/uhvi_areas_v6.csv             generated area table ordered by UHVI rank
public/assets/*_v6.pdf              supplied UHVI, baseline-LST, greening and industrial layouts
data/opencellid/                 monthly cache
data/sites.json                  generated dashboard data (see above)
data/phase6_telecom_heat_risk.ipynb  OpenCelliD sampling + risk pipeline
data/phase7_web_export.ipynb         web data contract
```

## Attribution & license

Cell data: **© OpenCelliD, CC BY-SA 4.0** (<https://opencellid.org>). Basemap tiles
© OpenStreetMap contributors.

## Caveats

- The smooth surface is a visual interpolation of 0.01° evidence cells; inspect grid
  cells or v6 polygons for numeric values.
- UHVI supports constituency-level screening only. It must not be used for parcel,
  person, address or asset-level classification, emergency dispatch, or automation.
- OpenCelliD is crowd-sourced and not an official tower inventory — treat it as an
  indicative proxy for where thermal risk concentrates.
- Site scores are screening aids only and do not replace planning permission,
  engineering design, or public-health review.
