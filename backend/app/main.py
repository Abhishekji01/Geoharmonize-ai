from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .pipeline import AUTO_ACCEPT, OWNER_SAME, Entity, RunResult, owner_sim, run_pipeline, to_geojson
from .store import DecisionStore
from .synthetic import SIZES, generate_ward
from shapely.ops import transform as shp_transform

app = FastAPI(title="GeoHarmonize AI", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

store = DecisionStore()
_runs: dict[str, RunResult] = {}
_lock = threading.Lock()

Size = Literal["small", "medium", "large"]


def run_id(size: str, seed: int) -> str:
    return f"{size}-{seed}"


def get_run(rid: str) -> RunResult:
    try:
        size, seed = rid.rsplit("-", 1)
        seed_i = int(seed)
    except ValueError:
        raise HTTPException(404, "Unknown run id")
    if size not in SIZES:
        raise HTTPException(404, "Unknown run size")
    with _lock:
        if rid not in _runs:
            _runs[rid] = run_pipeline(generate_ward(seed_i, size), size)
        return _runs[rid]


# ───────── presentation of an entity, with reviewer decisions applied ─────────
def _effective(e: Entity, dec: dict | None) -> dict:
    final = dict(e.values["final"])
    status = e.status
    if dec:
        status = "validated" if dec["decision"] == "accept" else "rejected"
        for fld, source in dec["resolutions"].items():
            if fld in ("owner", "land_use") and source in e.values[fld]:
                final[fld] = e.values[fld][source]
                if fld == "owner":
                    final["owner_source"] = source
    return {"final": final, "status": status}


def _reasons(e: Entity) -> list[str]:
    out = [c["kind"] for c in e.conflicts if c["status"] == "flagged"]
    if not out and e.status == "needs_review":
        weakest = min(e.components, key=e.components.get)
        out.append({"geometry": "Boundary agreement is weak", "attributes": "Records disagree on details",
                    "extraction": "Low-confidence drone extraction", "coverage": "Few sources cover this parcel"}[weakest])
    return out


def _props(e: Entity, dec: dict | None) -> dict:
    eff = _effective(e, dec)
    return {
        "id": e.id, "key": e.key, "owner": eff["final"]["owner"], "land_use": eff["final"]["land_use"],
        "area_sqm": eff["final"]["area_sqm"], "confidence": e.confidence, "status": eff["status"],
        "sources": e.sources(), "open_conflicts": sum(c["status"] == "flagged" for c in e.conflicts),
        "resolved_conflicts": sum(c["status"] == "resolved" for c in e.conflicts),
        "changes": e.changes, "n_edits": len(e.edits), "review_reasons": _reasons(e) if eff["status"] == "needs_review" else [],
    }


def _ll_geom(r: RunResult, g):
    return to_geojson(shp_transform(r.ll.transform, g))


def _feature(r: RunResult, e: Entity, dec: dict | None) -> dict:
    return {"type": "Feature", "id": e.id, "properties": _props(e, dec), "geometry": _ll_geom(r, e.final_geom)}


# ───────── schemas ─────────
class RunRequest(BaseModel):
    seed: int = Field(7, ge=0, le=9999)
    size: Size = "medium"


class ReviewRequest(BaseModel):
    decision: Literal["accept", "reject"]
    resolutions: dict[str, str] = Field(default_factory=dict, description="field -> source whose value to keep")
    note: str = Field("", max_length=500)


# ───────── routes ─────────
@app.get("/api/health")
def health():
    return {"status": "ok", "version": app.version}


@app.get("/api/catalog")
def catalog():
    """The ten datasets named in the problem statement and how this build treats each."""
    rows = [
        ("Drone imagery", "extraction", "Represented by AI-extracted boundaries (sample output)"),
        ("Orthorectified imagery (ORI)", "extraction", "Source of the survey-grade boundaries used for alignment"),
        ("DSM/DTM", "planned", "Elevation layers are not used yet"),
        ("Existing cadastral maps", "modelled", "Polygon layer in EPSG:4326 with survey offset and ring errors"),
        ("Revenue records", "modelled", "Tabular owner, area and land-use records with inconsistent plot references"),
        ("Municipal GIS layers", "modelled", "Polygon layer in EPSG:3857 with its own attribute names"),
        ("Utility network data", "planned", "Not modelled in this build"),
        ("GNSS/CORS survey data", "planned", "Not modelled; would anchor the alignment step"),
        ("Ground truthing", "planned", "Stood in for by the synthetic ground truth during benchmarking"),
        ("Building footprint datasets", "modelled", "Polygon layer used for change detection"),
    ]
    return [{"name": n, "status": s, "note": t} for n, s, t in rows]


@app.post("/api/runs")
def create_run(req: RunRequest):
    rid = run_id(req.size, req.seed)
    get_run(rid)
    return {"id": rid}


@app.get("/api/runs/{rid}")
def run_summary(rid: str):
    r = get_run(rid)
    decs = store.for_run(rid)
    stat: dict[str, int] = {}
    for e in r.entities:
        s = _effective(e, decs.get(e.id))["status"]
        stat[s] = stat.get(s, 0) + 1
    xs, ys = [], []
    for e in r.entities:
        minx, miny, maxx, maxy = _ll_geom_bounds(r, e)
        xs += [minx, maxx]; ys += [miny, maxy]
    return {
        "id": rid, "seed": r.seed, "size": r.size, "parcels": len(r.entities),
        "bounds": [min(xs), min(ys), max(xs), max(ys)],
        "cadastral_shift_m": {"east": round(r.offset[0], 2), "north": round(r.offset[1], 2)},
        "auto_accept_threshold": AUTO_ACCEPT,
        "status_counts": stat, "stages": r.stages, "benchmark": r.benchmark,
        "synthetic": True,
        "origin_utm": _origin_utm(r),
        "crs": "EPSG:32644",
    }


def _origin_utm(r: RunResult) -> list[float]:
    """UTM easting/northing of the bounds centre, which the front end uses as its map origin."""
    from pyproj import Transformer
    xs, ys = [], []
    for e in r.entities:
        b = _ll_geom_bounds(r, e)
        xs += [b[0], b[2]]; ys += [b[1], b[3]]
    lon, lat = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    x, y = Transformer.from_crs("EPSG:4326", "EPSG:32644", always_xy=True).transform(lon, lat)
    return [round(x, 2), round(y, 2)]


def _ll_geom_bounds(r: RunResult, e: Entity):
    return shp_transform(r.ll.transform, e.final_geom).bounds


@app.get("/api/runs/{rid}/layers/{layer}")
def layer(rid: str, layer: str):
    r = get_run(rid)
    if layer == "harmonized":
        decs = store.for_run(rid)
        feats = [_feature(r, e, decs.get(e.id)) for e in r.entities]
    elif layer in r.raw_layers:
        feats = [{"type": "Feature", "id": f["id"], "properties": {"id": f["id"], **{k: v for k, v in f["props"].items() if k in ("detection_confidence", "storeys")}},
                  "geometry": f["geometry"]} for f in r.raw_layers[layer]]
    else:
        raise HTTPException(404, "Unknown layer")
    return JSONResponse({"type": "FeatureCollection", "features": feats}, headers={"Cache-Control": "no-cache"})


def _find(r: RunResult, eid: str) -> Entity:
    for e in r.entities:
        if e.id == eid:
            return e
    raise HTTPException(404, "Unknown parcel")


@app.get("/api/runs/{rid}/parcels/{eid}")
def parcel(rid: str, eid: str):
    r = get_run(rid)
    e = _find(r, eid)
    dec = store.for_run(rid).get(eid)
    final = _effective(e, dec)["final"]
    return {
        **_props(e, dec),
        "owner_agrees": {s: owner_sim(v, final["owner"]) >= OWNER_SAME for s, v in e.values["owner"].items()},
        "land_use_agrees": {s: v == final["land_use"] for s, v in e.values["land_use"].items()},
        "values": {k: v for k, v in e.values.items() if k != "final"},
        "conflicts": e.conflicts, "components": e.components, "edits": e.edits,
        "detection_confidence": e.ori.props["detection_confidence"] if e.ori else None,
        "buildings": len(e.buildings), "decision": dec,
    }


@app.get("/api/runs/{rid}/review")
def review_queue(rid: str):
    r = get_run(rid)
    decs = store.for_run(rid)
    rows = []
    for e in r.entities:
        p = _props(e, decs.get(e.id))
        if e.status == "needs_review":
            rows.append({**p, "decision": decs.get(e.id, {}).get("decision")})
    rows.sort(key=lambda x: (x["decision"] is not None, x["confidence"]))
    return rows


@app.post("/api/runs/{rid}/review/{eid}")
def submit_review(rid: str, eid: str, body: ReviewRequest):
    r = get_run(rid)
    e = _find(r, eid)
    if e.status != "needs_review":
        raise HTTPException(409, "This parcel was accepted automatically and has nothing to review")
    for fld, source in body.resolutions.items():
        if fld not in ("owner", "land_use") or source not in e.values.get(fld, {}):
            raise HTTPException(422, f"No {source!r} value to keep for {fld!r}")
    dec = store.put(rid, eid, body.decision, body.resolutions, body.note)
    return {**_props(e, dec), "decision": dec}


@app.delete("/api/runs/{rid}/review/{eid}")
def undo_review(rid: str, eid: str):
    get_run(rid)
    store.delete(rid, eid)
    return {"ok": True}


@app.get("/api/audit")
def audit():
    """Hash-chained log of every review decision, with a verification result."""
    return store.audit()


@app.get("/api/runs/{rid}/export.geojson")
def export(rid: str):
    r = get_run(rid)
    decs = store.for_run(rid)
    feats = []
    for e in r.entities:
        p = _props(e, decs.get(e.id))
        if p["status"] == "rejected":
            continue
        p["confidence_components"] = e.components
        p["source_traceability"] = {"sources": e.sources(), "values": {k: v for k, v in e.values.items() if k != "final"}}
        feats.append({"type": "Feature", "id": e.id, "properties": p, "geometry": _ll_geom(r, e.final_geom)})
    return JSONResponse({"type": "FeatureCollection", "crs": {"type": "name", "properties": {"name": "EPSG:4326"}}, "features": feats},
                        headers={"Content-Disposition": f'attachment; filename="geoharmonize-{rid}.geojson"'})


# ───────── built frontend (production image) ─────────
_dist = Path(os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if _dist.is_dir():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = (_dist / path).resolve()
        if path and f.is_file() and _dist.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(_dist / "index.html")
