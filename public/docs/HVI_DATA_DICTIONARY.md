# Heat Vulnerability and thermal-exposure data dictionary

## Two layers that must not be conflated

### 1. Supplied UHVI 2024 reference

The source `UHVI_Klang_Valley_Layout.pdf` is a one-page QGIS cartographic layout titled “Urban Heat Vulnerability Index (UHVI) — Klang Valley, 2024.” It shows five published score classes:

| Display class | Published score range |
|---|---:|
| 1 | 0.133–0.41 |
| 2 | 0.41–0.498 |
| 3 | 0.498–0.547 |
| 4 | 0.547–0.633 |
| 5 | 0.633–0.779 |

The supplied PDF does not expose zone IDs, attributes, a declared CRS, or machine-readable geometry. It is therefore approved in this release for municipal-scale visual reference only. Do not use it for address/parcel classification, routing, emergency dispatch, or automated resource allocation.

### 2. Derived thermal-exposure grid

`heat_exposure_grid.geojson` aggregates the telecom/model records into nominal 0.01° cells. It is an **exposure** layer, not a complete HVI.

| Field | Type | Definition |
|---|---|---|
| `cell_id` | string | Stable release-local identifier |
| `records` | integer | Number of supplied telecom records in cell |
| `mean_lst_c` | number | Mean baseline predicted land-surface temperature |
| `model_scenario_lst_c` | number | Mean supplied scenario LST |
| `max_lst_c` | number | Maximum baseline predicted LST |
| `high_risk_share` | number, 0–1 | Share with baseline LST ≥38 °C |
| `exposure_index` | number, 0–100 | 65% normalised mean LST + 35% high-risk share |
| `exposure_priority` | enum | Watch <50; Elevated 50–<70; Critical ≥70 |
| `indicator_scope` | string | Machine-readable limitation statement |

Grid geometry is WGS 84 longitude/latitude inherited from the supplied CSV. A 0.01° cell is not a constant metric area and must not be treated as one.

## Source telecom records

The dashboard uses 37,747 records with WGS 84 longitude/latitude, predicted LST, risk tier, scenario delta/LST/tier, technology and network codes, range, and sample count. Public-health interpretation must not treat telecom record density as population density.

## Required work for an operational HVI

Before public-health or civil-defense teams use UHVI for operational allocation:

1. Obtain authoritative polygon/raster data with stable geography IDs, CRS, lineage, update date, and custodian.
2. Document the UHVI formula and current inputs for exposure, demographic sensitivity, and adaptive capacity.
3. Join current population, age, disability/chronic-condition safeguards, income/deprivation where lawful, housing, tree canopy, cooling access, health facilities, and emergency-response capacity.
4. Validate missingness, temporal alignment, spatial scale, uncertainty, and disparate impact.
5. Define tier-specific action protocols with health and emergency authorities; UHVI tiers are not meteorological alert thresholds.
6. Complete data-protection, ethics, accessibility, security, and accountable-owner sign-off.

`uhvi_layer_metadata.json` is the machine-readable release record for this boundary.
