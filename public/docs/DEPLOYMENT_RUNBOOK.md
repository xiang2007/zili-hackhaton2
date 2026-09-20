# Deployment runbook

## Local briefing mode

```bash
npm install
npm run build:data
npm test
npm start
```

Open `http://localhost:4173`. Leaflet is vendored locally. OpenStreetMap tiles require internet; if unavailable, turn off Basemap—the source raster, smoothed scenario/exposure surfaces, points, scenario tool, exports, documents, and reference images continue to work.

## Static hosting

Publish the contents of `dashboard/` as the web root on an approved static host. No server-side runtime or environment variables are required.

For the current Cloudflare Workers interface, connect the Git repository from
the repository root, leave the build command blank, and set the deploy command
to `npx wrangler deploy`. The root-level `wrangler.jsonc` publishes
`dashboard/` as static assets, so no Worker source file is required.

Recommended controls before external release:

1. Decide whether exact telecom coordinates may be disclosed; prefer authentication or a public generalised build.
2. Configure HTTPS, a restrictive Content Security Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and appropriate caching.
3. Replace the public OpenStreetMap tile endpoint with an approved basemap/tile service for production traffic and comply with its usage policy and attribution.
4. Run `npm test`, complete keyboard/screen-reader review, and conduct agency acceptance.
5. Run `npm run package`; record archive checksum and approver.
6. Keep the previous archive available for rollback.

## Smoke test

- Overview metrics show 37,747 records and 15,945 baseline High-risk records.
- The continuous baseline raster and both smoothed derived surfaces render; opacity/layer toggles work.
- Scenario +2.0 °C changes the High-risk count; reset restores the baseline.
- A map-click candidate appears, rescoring changes with weight, and CSV/memo exports download.
- UHVI reference, documents, data downloads, and presentation open.
- Feedback saves locally and exports JSON.
- Mobile layout exposes both map and controls; keyboard focus is visible.

## Rollback

Switch the host’s published directory to the preceding immutable archive, verify its checksum, repeat the smoke test, and log the reason/impact. Preserve the failed release for investigation unless records policy requires otherwise.
