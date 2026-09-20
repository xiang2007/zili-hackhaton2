# Dashboard usability and iteration protocol

## Participants

Recruit at least two task performers from each target role: municipal planner, GIS analyst, public-health/resilience officer, civil-defense/emergency coordinator, telecom engineer, and board secretariat. Include keyboard-only and low-vision review.

## Five task script

1. Identify how many telecom records are High risk at baseline and state the threshold.
2. Apply +2.0 °C regional heat and 1.0 °C cooling; report scenario High-risk count and change.
3. Open the UHVI reference and explain why it cannot be used for parcel-level dispatch.
4. Place a proposed site in the reviewer’s service area, adjust the thermal weight, and export a board memo.
5. Find the data dictionary and name two mandatory data gaps before operational HVI use.

Capture task completion, time, wrong turns, assistance, confidence (1–5), and one verbatim improvement request. Do not store personal health or sensitive demographic information in the feedback form.

## Acceptance targets

- 90% complete Tasks 1–3 without assistance.
- 80% complete Tasks 4–5 without assistance.
- Median ease rating ≥4/5.
- Zero users interpret exposure grid as a complete HVI after reading the interface.
- Keyboard journey covers navigation, controls, dialogs, export, and close actions.
- All severity-1 issues resolved; severity-2 issues have an owner and due date.

## Severity and iteration

| Severity | Definition | Response |
|---|---|---|
| S1 | Could produce unsafe/incorrect decision or expose protected data | Stop pilot; resolve and revalidate |
| S2 | Blocks a core task for a user group | Fix before general release |
| S3 | Causes delay/confusion with workaround | Prioritise next iteration |
| S4 | Cosmetic/preference | Backlog with rationale |

Run one moderated round, implement fixes, then a second independent confirmation round. Export feedback JSON, assign issue IDs, and record resolution evidence in the release archive.
