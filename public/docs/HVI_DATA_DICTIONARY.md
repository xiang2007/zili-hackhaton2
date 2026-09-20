# Heat Vulnerability and thermal-exposure data dictionary

## Two layers that must not be conflated

### 1. UHVI v6 constituency layer

`dashboard_data_v6_kl.geojson` contains 56 machine-readable constituency polygons across Selangor, W.P. Kuala Lumpur, and W.P. Putrajaya. Geometry is GeoJSON longitude/latitude (WGS 84). The matching cartographic source is `UHVI_Klang_Valley_v6.pdf`.

The five published display classes are:

| Display class | UHVI score range | Areas |
|---|---:|---:|
| 1 | 0.312–<0.394 | 6 |
| 2 | 0.394–<0.498 | 11 |
| 3 | 0.498–<0.609 | 17 |
| 4 | 0.609–<0.722 | 15 |
| 5 | 0.722–0.804 | 7 |

| Field | Type | Definition |
|---|---|---|
| `dun`, `code_dun` | string | Display name and constituency code; Kuala Lumpur and Putrajaya use parliamentary codes |
| `state`, `parlimen`, `district` | string | Administrative labels supplied with the release |
| `population` | integer | Supplied area population |
| `lst_mean` | number, °C | Mean baseline land-surface temperature |
| `income_mean` | number, RM | Supplied mean income |
| `elderly_pct` | number, % | Supplied older-population share |
| `lst_norm` | number, 0–1 | Normalised LST component |
| `income_vuln` | number, 0–1 | Income-vulnerability component |
| `elderly_norm` | number, 0–1 | Normalised older-population component |
| `uhvi` | number, 0–1 | Composite Urban Heat Vulnerability Index |
| `green_mean/min/max` | number, °C | Greening-corridor temperature-change summary |
| `ind_mean/min/max` | number, °C | Industrial-scenario temperature-change summary |
| `rank` | integer | Regional rank, 1 = highest UHVI |

The layer supports area-level screening and comparison. It does not support parcel, person, address, or asset-level classification, emergency dispatch, or automated approvals. Stable custodian identifiers, full methodology/version lineage, uncertainty, temporal alignment, and operational validation still require owner confirmation.

### 2. Derived thermal-exposure grid

`heat_exposure_grid.geojson` aggregates 45,660 telecom records into nominal 0.01° cells. It is an **exposure** layer, not a complete HVI.

| Field | Type | Definition |
|---|---|---|
| `cell_id` | string | Stable release-local identifier |
| `records` | integer | Number of telecom records in the cell |
| `mean_lst_c` | number | Mean baseline LST assigned from the v6 area layer |
| `model_scenario_lst_c` | number | Mean LST after the optional greening delta |
| `max_lst_c` | number | Maximum baseline LST |
| `high_risk_share` | number, 0–1 | Share with baseline LST ≥38 °C |
| `exposure_index` | number, 0–100 | 65% normalised mean LST + 35% high-risk share |
| `exposure_priority` | enum | Watch <50; Elevated 50–<70; Critical ≥70 |
| `indicator_scope` | string | Machine-readable limitation statement |

A 0.01° cell is not a constant metric area. Telecom-record density must not be interpreted as population density.

## Operational validation still required

Before public-health or civil-defense allocation:

1. Confirm UHVI formula, component vintage, class boundaries, stable geography identifiers, and accountable custodian.
2. Validate population, income, age, canopy, cooling access, health-facility, and response-capacity inputs.
3. Test missingness, temporal alignment, spatial scale, uncertainty, and disparate impact.
4. Define tier-specific action protocols with health and emergency authorities; UHVI tiers are not meteorological alert thresholds.
5. Complete data-protection, ethics, accessibility, security, and accountable-owner sign-off.

`data/uhvi_layer_metadata.json` records the machine-readable release boundary.
