# GeoHarmonize AI

Automated integration and intelligent harmonization of multi-source geospatial data for urban land record management. Smart India Hackathon 2026, problem statement 26013.

The site explains the idea, and the **workbench** runs it: five messy departmental layers go in, one confidence-scored land record comes out, and a person only reviews the parcels the system can't settle.

## What is real in this build

| Part | Status |
| --- | --- |
| CRS detection and re-projection (EPSG:4326, 3857 to 32644) | Real, pyproj |
| Plot-reference, owner-name and land-use normalisation | Real |
| Cadastral to drone-boundary alignment, spatial matching | Real, IoU scoring plus median-offset registration |
| Topology repair, snapping, overlap trimming | Real, Shapely |
| Change detection, source-aware conflict rules, confidence scoring | Real |
| Human-in-the-loop review, decisions saved in SQLite, GeoJSON export | Real |
| Tamper-evident audit log: every decision is hash-chained, and `/api/audit` re-verifies the chain | Real |
| AI feature extraction from imagery | **Simulated.** The ORI boundaries and detection confidences are generated, not produced by a vision model |
| Input data | **Synthetic.** A generated ward with a known answer, so the run can be benchmarked |
| DSM/DTM, utility network, GNSS/CORS, ground truthing | Not modelled yet |
| PostGIS storage, cloud/parallel processing | Planned |

Benchmark numbers on the site come from scoring the pipeline against the generated ground truth. They say the pipeline works on that ward, not how it will do on real records.

## Run it

```bash
# API
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (second terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api to :8000
```

Tests: `cd backend && pytest`.

One container (frontend built and served by the API):

```bash
docker build -t geoharmonize .
docker run -p 8000:8000 -v geoharmonize-data:/srv/data geoharmonize
```

## API

| Method | Path | |
| --- | --- | --- |
| GET | `/api/catalog` | The ten datasets in the problem statement and how each is treated |
| POST | `/api/runs` | `{seed, size}` runs the pipeline on a generated ward and returns a run id |
| GET | `/api/runs/{id}` | Stage-by-stage metrics, status counts, benchmark |
| GET | `/api/runs/{id}/layers/{name}` | GeoJSON: `cadastral`, `ori`, `municipal`, `buildings` (as received) or `harmonized` |
| GET | `/api/runs/{id}/parcels/{pid}` | Source values, conflicts, score components, edits |
| GET | `/api/runs/{id}/review` | Human-validation queue |
| POST / DELETE | `/api/runs/{id}/review/{pid}` | Accept or reject, choosing which source's value to keep; or undo |
| GET | `/api/audit` | Audit log head, recent entries, and whether the hash chain still verifies |
| GET | `/api/runs/{id}/export.geojson` | Harmonized records with source traceability |

## Layout

```
backend/app/synthetic.py   generated ward and its five source layers
backend/app/pipeline.py    the seven stages, conflict rules, confidence score, benchmark
backend/app/main.py        FastAPI routes
backend/app/store.py       reviewer decisions (SQLite)
frontend/src               React + TypeScript + Vite; the map is hand-drawn SVG (no tile service) with
                           survey-sheet furniture: UTM ticks, scale bar, north arrow, live coordinates, hatching
```

## Workbench shortcuts

`J` and `K` move through parcels waiting for review, `A` accepts and jumps to the next one, `R` rejects.

## How the confidence score works

Each parcel scores 0 to 1 from boundary agreement with the drone extraction (38%), agreement between owner and land-use records (30%), drone detection confidence (14%) and how many sources cover it (18%). Each open conflict subtracts 0.10, up to 0.30. A parcel is accepted automatically at 0.80 or higher with no open conflict. Ownership conflicts are never settled automatically; the reviewer gets a suggested value.

## Next

1. Swap the simulated extraction for a real model run on ORI tiles.
2. Move storage to PostgreSQL/PostGIS and add shapefile/GeoPackage ingestion.
3. Anchor alignment with GNSS/CORS control points and use DSM/DTM for building heights.
4. Calibrate the score weights on surveyed ground truth.
