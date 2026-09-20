# Executive summary: Klang Valley heat decision support

**Release:** Phase 6 · data v6
**Audience:** DBKL, MBSA, MBPJ, public health, civil defense, telecom and planning partners
**Decision status:** Screening and coordination support; not statutory approval

## Decision headline

The v6 release adds a machine-readable Urban Heat Vulnerability Index for **56 constituencies** across Selangor, Kuala Lumpur and Putrajaya, representing a supplied population of **8,964,200**. UHVI values span **0.312–0.804**; seven areas are in the highest published class (≥0.722). Kepong ranks first at 0.804.

The rebuilt portfolio contains **45,660 telecom records**. At baseline, **9,607 (21.0%)** are High risk (LST ≥38 °C), **24,087** are Medium, and **11,966** are Low. Mean assigned LST is **34.61 °C**, with area values from **27.37 °C to 44.77 °C**.

Use the dashboard for three bounded decisions:

1. Compare UHVI rank and components across supplied constituencies.
2. Identify heat-exposed telecom records and evidence cells for engineering review.
3. Compare regional warming, cooling and the supplied greening-corridor scenario, then export preliminary proposed-site screens.

## What boards receive

- An inspectable five-class UHVI choropleth with rank, population, LST, income and older-population attributes.
- Reversible baseline, scenario and thermal-exposure surfaces.
- Source thresholds: **<32 °C**, **32–<38 °C**, **≥38 °C**.
- New UHVI, baseline-LST and greening-delta source layouts.
- GeoJSON/CSV downloads, proposed-site register, board memo, data dictionary, and handoff package.

## Critical limitation

UHVI is an area-level screening index. It does not justify parcel/person classification, emergency dispatch or automated resource allocation. The telecom grid is a separate thermal-exposure proxy: record density is not population density. Custodians must confirm methodology, vintages, uncertainty, stable IDs and operational protocols before publication or allocation decisions.

## 90-day handoff recommendation

- **Days 0–15:** Custodian review of v6 methodology, thresholds, access and disclosure; agree accountable owner.
- **Days 16–45:** DBKL/MBSA/MBPJ task-based workshops; validate boundaries, population, critical facilities, canopy, land use and intervention inventories.
- **Days 46–75:** Validate scenario assumptions with meteorological, public-health and engineering partners; complete equity, accessibility and security review.
- **Days 76–90:** Publish an approved build, record checksums, train duty teams and schedule quarterly data/model review.

## Approval ask

Approve the package for **controlled pilot use** and nominate product, GIS/data, public-health, planning/legal and telecom-engineering owners. Do not authorize automated approvals or emergency dispatch until the required validation gates are complete.