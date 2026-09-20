# Executive summary: Klang Valley heat decision support

**Release:** Phase 6 v1.1.0
**Audience:** DBKL, MBSA, MBPJ, public health, civil defense, telecom and planning partners
**Decision status:** Screening and coordination support; not statutory approval

## Decision headline

The supplied portfolio contains **37,747 telecom records**. At baseline, **15,945 (42.2%)** are in the source-defined High risk tier (predicted land-surface temperature ≥38 °C); **18,336** are Medium and **3,466** are Low. Mean predicted LST is **37.66 °C**, with modelled values from **23.98 °C to 53.07 °C**.

The operational recommendation is to use the dashboard for three bounded decisions:

1. Identify heat-exposed telecom records and evidence-grid cells for engineering review.
2. Compare common warming/cooling assumptions consistently across agencies.
3. Register and export proposed-site screens before mandatory statutory, engineering, environmental, equity, and consultation checks.

## KLCAP2050 contribution

The official Kuala Lumpur Climate Action Plan identifies heat, flood, and drought as key climate hazards and sets a **Cooler City by decreasing Urban Heat Island** goal. It also calls for monitoring, evaluation, reporting, and interdepartmental delivery. This package supports that direction by establishing a reproducible heat evidence surface, scenario measures, ownership gates, and exportable review records. It does not claim to measure citywide health outcomes or policy impact without additional data. See the [official KLCAP2050 report](https://www.dbkl.gov.my/files/kuala-lumpur-climate-action-plan-%28klcap2050%29.pdf) and [DBKL publication page](https://www.dbkl.gov.my/en/penerbitan-dan-laporan/kuala-lumpur-climate-action-plan-2050).

The Kuala Lumpur Structure Plan 2040 also frames Goals 3 and 4 around a green, healthy city and climate-smart resilience, including canopy and climate-adaptation directions. The dashboard can support spatial prioritisation and monitoring once authoritative administrative, canopy, population, and intervention layers are joined. See the [official PSKL2040 portal](https://ppkl.dbkl.gov.my/en/pskl2040/).

## What boards receive

- A transparent scenario tool with reversible regional warming and cooling assumptions.
- Source-verified Low/Medium/High thresholds: **<32 °C**, **32–<38 °C**, **≥38 °C**.
- A proposed-site screen combining thermal resilience and distance to the nearest supplied telecom record; weights are visible and exportable.
- A board memo, candidate CSV, public-health action matrix, UHVI metadata, data dictionary, and presentation.
- An archive process with SHA-256 checksums and reproducible data-build scripts.

## Critical limitation

The supplied UHVI is a cartographic PDF without vector geometry, CRS metadata, or zone IDs. It is preserved as a strategic reference. The derived GeoJSON is intentionally named **thermal exposure grid**: it does not include demographic sensitivity or adaptive capacity and must not be represented as a complete Heat Vulnerability Index.

## 90-day handoff recommendation

- **Days 0–15:** Custodian review of thresholds, terminology, and authoritative UHVI source data; security/accessibility review; agree accountable owner.
- **Days 16–45:** DBKL/MBSA/MBPJ task-based usability workshops; join current boundaries, population, critical facilities, canopy, land use, and intervention inventories.
- **Days 46–75:** Validate scenario assumptions with meteorological and engineering partners; resolve usability findings; complete data-protection and operational-readiness review.
- **Days 76–90:** Publish an approved static build, record release checksum, train duty teams, and schedule quarterly data/model review.

## Approval ask

Approve the package for **controlled pilot use** and nominate: one product owner, one GIS/data custodian, one public-health reviewer, one planning/legal reviewer, and one telecom engineering reviewer. Do not authorize automated approvals or emergency dispatch until the mandatory datasets and validation gates are complete.
