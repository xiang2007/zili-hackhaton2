# Data governance, model register, and archive plan

## Custody model

| Asset | Proposed owner | Review cadence | Release control |
|---|---|---|---|
| Source telecom CSV | Telecom/GIS data custodian | On source refresh | Schema, bounds, row count, checksum |
| LST/scenario model | Model owner + independent reviewer | At least annually and after material input change | Validation report, error metrics, version, assumptions |
| UHVI source/vector layer | Public-health/GIS custodian | At policy/data refresh | CRS, formula, component vintage, equity review |
| Dashboard code/release | Product owner | Quarterly or change-triggered | Tests, accessibility, security, acceptance sign-off |
| Decision exports | Relevant board secretariat | Per records policy | Meeting ID, date, assumptions, outcome, retention class |
| Feedback log | Product owner | Per usability round | De-identification, issue mapping, disposal date |

## Release manifest

Every production archive must include:

- Release name, UTC timestamp, semantic version, accountable owner, and approval status.
- SHA-256 checksum for every file.
- Source data checksum and row/schema/bounds summary.
- Model formula/threshold version and known limitations.
- Test report, accessibility/security review, feedback issue log, and change log.
- Deployment target, rollback artifact, retention class, and next review date.

`npm run package` generates a timestamped archive and checksum manifest under `release/`.

## Retention and privacy

This release contains infrastructure-related coordinates. Before public deployment, the accountable owner must classify disclosure risk and decide whether exact telecom points should be suppressed, aggregated, authenticated, or access-logged. The default recommendation is **controlled access** for exact points and public release of an appropriately generalised grid only.

The dashboard stores workshop feedback in local browser storage. Export it to the controlled project record, then clear browser-site data on shared devices. Do not enter personal health, protected demographic, authentication, or commercially sensitive network information.

## Model monitoring

At each refresh, compare row/schema changes, spatial bounds, missingness, LST distribution, tier shares, scenario delta distribution, and geographic error where observations exist. Material drift, threshold changes, or data-source changes require a new version and board re-approval.
