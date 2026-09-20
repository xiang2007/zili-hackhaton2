# Baseline land-surface-temperature layer

## What was implemented

`Baseline_LST_Layout.pdf` contains a continuous QGIS-rendered heat surface with a published range of **22.066582–53.642132 °C**. The 1,815 × 1,439 embedded raster was extracted directly from the PDF without taking a screen capture and is displayed as the dashboard’s default smooth baseline layer.

The raster is registered to the matching supplied telecom study extent:

- West: 101.3000
- South: 2.9036
- East: 101.7999
- North: 3.3002
- Dashboard CRS: WGS 84 longitude/latitude

## Interpretation boundary

The source PDF does not encode geospatial metadata as a GeoPDF or provide a source GeoTIFF. Registration therefore uses the matching study frame rather than embedded control points. The smooth raster is suitable for municipal-scale visual interpretation, but its rendered colours must not be sampled as authoritative numeric values.

Numeric inspection continues to use the derived 0.01° evidence cells and source telecom/model records. This keeps the map visually continuous while retaining traceable values and scenario calculations.

## Scenario and exposure rendering

Scenario LST and thermal-exposure index remain derived from the evidence grid. A 64 × 52 Gaussian-distance-weighted matrix is bilinearly rendered to a continuous raster canvas in the browser, removing the tile-like appearance without changing the underlying inspection values or click targets.

Machine-readable provenance is recorded in `data/baseline_lst_metadata.json`.
