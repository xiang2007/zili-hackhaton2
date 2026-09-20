# Predictive Scenario Tool: approval-board guide

## Purpose

Use the tool to compare proposed telecom locations under a shared heat scenario and to produce a consistent preliminary screening record. The output is evidence for discussion, not planning permission or engineering certification.

## Scenario controls

- **Regional heat stress:** uniform adjustment from −2.0 °C to +5.0 °C.
- **Cooling intervention:** uniform reduction from 0.0 °C to 4.0 °C.
- **Supplied greening delta:** optional v6 area-level `green_mean` assigned to each record.
- **Scenario LST:** baseline LST + regional heat stress − cooling intervention + optional greening delta.
- **Risk tiers:** Low <32 °C; Medium 32–<38 °C; High ≥38 °C.

Record every assumption in the exported memo. Do not compare memos whose assumptions differ without stating the difference.

## Proposed-site screen

After a reviewer clicks a map location, the tool estimates local scenario LST using inverse-distance weighting across the 12 nearest supplied telecom records. It also measures distance to the nearest supplied record.

```text
thermal resilience score = clamp((42 − estimated scenario LST) / 14, 0, 1) × 100
coverage-gap score       = clamp(nearest-record distance / 3 km, 0, 1) × 100
composite score          = thermal score × thermal weight
                         + coverage score × coverage weight
```

Default weights are 60% thermal resilience and 40% coverage gap. Screening labels are:

- **70–100:** Recommend for study
- **45–69:** Conditional review
- **0–44:** Hold / redesign

These labels are workflow triage only. A high score cannot override a failed mandatory gate.

## Mandatory gates

1. Statutory planning, zoning, development-plan consistency, and land tenure.
2. RF performance, structural/geotechnical design, power, backhaul, access, and redundancy.
3. Environmental, drainage, biodiversity, heritage, construction, and worker-safety review.
4. Current demographic vulnerability, essential-facility access, and distributive-equity assessment.
5. Agency, landowner, utility, emergency-service, and community consultation.
6. Cybersecurity, data protection, record retention, and named decision accountability.

## Suggested board record

Keep the exported candidate CSV and HTML memo with meeting date, attendees, scenario assumptions, evidence release checksum, decisions, gate owners, due dates, and dissent/uncertainty notes. The static app does not provide a central audit trail.
