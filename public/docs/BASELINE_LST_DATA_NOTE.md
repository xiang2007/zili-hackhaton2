# Baseline land-surface-temperature layer

## What is displayed

`LST_Baseline_Klang_Valley_v6.pdf` is the QGIS cartographic reference and displays a continuous 25–50 °C legend. The dashboard baseline background uses the 1188 × 943 source raster embedded in that PDF, registered to the dashboard study bounds. Scenario and exposure views continue to use the derived 64 × 52 display matrix.

The v6 constituency means span **27.374–44.775 °C**. Click an evidence cell or UHVI polygon for numeric values; do not sample colours from the PDF image.

## Interpretation boundary

The source PDF is not a GeoPDF or source GeoTIFF, so its embedded raster is aligned to the study bounds rather than recovered from native georeferencing. It is suitable as a regional visual background, not for parcel-temperature estimation or pixel sampling. Inspect an evidence cell or v6 area for numeric values.

## Scenario and exposure rendering

Scenario LST applies regional warming, user-specified cooling, and optionally the v6 area-level `green_mean` greening delta. The thermal-exposure index is a telecom-focused proxy and remains separate from the demographic UHVI layer.

Machine-readable provenance is recorded in `data/baseline_lst_metadata.json` and `data/summary.json`.
