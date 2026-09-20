# Quality-assurance report — Phase 6 v1.1.0

**Assessment date:** 11 August 2026  
**Release profile:** Controlled technical data / pilot decision support

## Automated results

| Check | Result |
|---|---|
| Artifact/schema/checksum validation | Pass — v6 artifacts, 45,660 source records, 2,423 grid cells, 56 UHVI areas |
| Source/deployed CSV SHA-256 match | Pass |
| Local HTML links and assets | Pass |
| Desktop scenario-to-approval journey | Pass |
| Candidate CSV and printable board-memo exports | Pass |
| Feedback local storage and versioned JSON export | Pass |
| Responsive 390 × 844 layout | Pass |
| Presentation keyboard navigation | Pass |
| Axe automated accessibility scan | Pass — overview, baseline LST dialog, approval, UHVI dialog, feedback dialog, mobile handoff, presentation |
| npm dependency security audit | Pass — 0 known vulnerabilities across production and development dependencies |

## Accessibility remediation in v1.0.1

- Increased muted-text, inactive-tab, tag, and feedback-helper contrast to meet WCAG AA automated thresholds.
- Added unique accessible names for candidate-removal controls.
- Added active-section semantics and presentation-control landmarks.
- Retained visible keyboard focus, skip navigation, labelled controls, dialog close controls, and mobile access to all sections.

Automated checks cannot establish complete WCAG conformance. The controlled pilot still requires keyboard-only, screen-reader, low-vision, zoom/reflow, and task-based review with representative users under `FEEDBACK_PROTOCOL.md`.

## Surface rendering added in v1.1.0

- Integrated the v6 area-level LST means as the default interactive heat surface and preserved the new baseline PDF as a reference layout.
- Documented the v6 constituency mean range (27.374–44.775 °C) and the separate 25–50 °C source-map legend.
- Added a 64 × 52 Gaussian-weighted matrix and bilinear client renderer for smooth scenario and exposure surfaces.
- Kept the exact 0.01° evidence cells invisibly interactive, so smoothing changes presentation rather than inspection values or scoring.

## Security and disclosure boundary

- The interface and handoff panel now visibly classify the bundle as **Controlled technical data** because exact infrastructure coordinates are present.
- Static-host security-header rules define CSP, clickjacking, MIME-sniffing, referrer, and browser-permission restrictions.
- Production publication remains blocked pending an accountable-owner decision on authentication or coordinate generalisation.
- Client-side UI warnings are not access control; the hosting layer must enforce the approved disclosure profile.

## Residual risks

1. The source UHVI is a cartographic PDF, not an authoritative machine-readable operational layer.
2. The derived exposure grid lacks demographic sensitivity and adaptive-capacity variables.
3. OpenStreetMap basemap tiles require an approved production tile service and usage arrangement.
4. The static application does not provide central identity, audit logging, or records retention.
5. Policy, engineering, public-health, and municipal acceptance remain external human approvals.
