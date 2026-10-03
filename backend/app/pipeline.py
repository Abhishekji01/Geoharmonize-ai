"""Seven-stage harmonisation pipeline.

ingest -> preprocess -> feature extraction -> spatial matching ->
harmonisation -> conflict engine -> confidence scoring / output.

Implemented with Shapely and pyproj. The ORI "feature extraction" stage reads the
sample extraction output; it does not run a computer-vision model (see README).
"""
from __future__ import annotations

import re
import statistics
import time
from dataclasses import dataclass, field
from difflib import SequenceMatcher

import numpy as np
from pyproj import Transformer
from shapely import make_valid, set_precision
from shapely.geometry import Polygon, mapping
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform as shp_transform
from shapely.strtree import STRtree

from .synthetic import CAD_CODE, WORKING_CRS, Feature, Ward

CODE_USE = {v: k for k, v in CAD_CODE.items()}
LOW_DETECTION = 0.62
AUTO_ACCEPT = 0.80
OWNER_SAME = 0.90


# ───────────────────────── helpers ─────────────────────────
def _project(geom: BaseGeometry | None, src: str | None, dst: str) -> BaseGeometry | None:
    if geom is None or src is None or src == dst:
        return geom
    t = Transformer.from_crs(src, dst, always_xy=True)
    return shp_transform(t.transform, geom)


def _valid(g: BaseGeometry) -> BaseGeometry:
    return g if g.is_valid else make_valid(g)


def iou(a: BaseGeometry | None, b: BaseGeometry | None) -> float:
    if a is None or b is None or a.is_empty or b.is_empty:
        return 0.0
    a, b = _valid(a), _valid(b)
    inter = a.intersection(b).area
    union = a.area + b.area - inter
    return inter / union if union > 0 else 0.0


def norm_key(raw: str | None) -> str | None:
    if not raw:
        return None
    m = re.search(r"(\d+)", raw)
    return f"KH-{int(m.group(1)):04d}" if m else None


_HONORIFICS = {"shri", "smt", "mr", "mrs", "ms", "sri", "late"}


def _name_parts(raw: str) -> tuple[str, str]:
    s = raw.lower().replace(".", " ")
    if "," in s:
        last, first = [p.strip() for p in s.split(",", 1)]
        s = f"{first} {last}"
    toks = [t for t in s.split() if t not in _HONORIFICS]
    if not toks:
        return "", ""
    return (toks[0], toks[-1]) if len(toks) > 1 else ("", toks[0])


def owner_sim(a: str | None, b: str | None) -> float:
    if not a or not b:
        return 0.0
    fa, la = _name_parts(a)
    fb, lb = _name_parts(b)
    last = SequenceMatcher(None, la, lb).ratio()
    if fa == fb:
        first = 1.0
    elif len(fa) == 1 or len(fb) == 1:
        first = 1.0 if fa[:1] == fb[:1] else 0.0
    else:
        first = SequenceMatcher(None, fa, fb).ratio() ** 2
    return 0.5 * last + 0.5 * first


def to_geojson(geom: BaseGeometry) -> dict:
    return mapping(geom)


# ───────────────────────── model ─────────────────────────
@dataclass
class Entity:
    id: str
    key: str | None = None
    cad: Feature | None = None
    ori: Feature | None = None
    mun: Feature | None = None
    rev: Feature | None = None
    buildings: list[Feature] = field(default_factory=list)
    cad_geom: BaseGeometry | None = None      # aligned, UTM
    ori_geom: BaseGeometry | None = None      # UTM
    mun_geom: BaseGeometry | None = None      # UTM
    final_geom: BaseGeometry | None = None    # UTM
    edits: list[str] = field(default_factory=list)
    changes: list[str] = field(default_factory=list)
    conflicts: list[dict] = field(default_factory=list)
    values: dict = field(default_factory=dict)
    components: dict = field(default_factory=dict)
    confidence: float = 0.0
    status: str = "needs_review"
    truth_id: str | None = None               # evaluation only, never read by decisions

    def sources(self) -> list[str]:
        s = []
        for name, f in (("cadastral", self.cad), ("ori", self.ori), ("municipal", self.mun), ("revenue", self.rev)):
            if f is not None:
                s.append(name)
        if self.buildings:
            s.append("buildings")
        return s

    @property
    def match_geom(self) -> BaseGeometry | None:
        g = self.cad_geom if self.cad_geom is not None else self.ori_geom
        return _valid(g) if g is not None else None


@dataclass
class RunResult:
    seed: int
    size: str
    stages: list[dict]
    entities: list[Entity]
    raw_layers: dict[str, list[dict]]
    ll: Transformer
    benchmark: dict
    offset: tuple[float, float]


def _metric(label: str, value, note: str | None = None) -> dict:
    return {"label": label, "value": value, **({"note": note} if note else {})}


# ───────────────────────── pipeline ─────────────────────────
def run_pipeline(ward: Ward, size: str = "medium") -> RunResult:
    stages: list[dict] = []
    ll = Transformer.from_crs(WORKING_CRS, "EPSG:4326", always_xy=True)

    def stage(n, name, fn):
        t0 = time.perf_counter()
        out = fn()
        stages.append({"n": n, "name": name, "ms": round((time.perf_counter() - t0) * 1000, 1), **out})

    src = ward.sources
    S: dict = {}

    # 1 ── ingestion
    def ingest():
        metrics, raw_layers = [], {}
        invalid_total = 0
        for name, s in src.items():
            geoms = [f.geometry for f in s.features if f.geometry is not None]
            bad = sum(1 for g in geoms if not g.is_valid)
            invalid_total += bad
            metrics.append(_metric(s.title, len(s.features), f"{s.crs or 'tabular, no geometry'}"
                                   + (f", {bad} invalid" if bad else "")))
            if geoms:
                raw_layers[name] = [
                    {"id": f.id, "geometry": to_geojson(_project(f.geometry, s.crs, "EPSG:4326")), "props": f.props}
                    for f in s.features if f.geometry is not None
                ]
        S["raw_layers"] = raw_layers
        crs_set = {s.crs for s in src.values() if s.crs}
        metrics.append(_metric("Distinct coordinate systems", len(crs_set), ", ".join(sorted(crs_set))))
        return {"summary": "Five departmental layers read as received. Nothing is corrected yet; this stage only records what each source is and what is wrong with it.",
                "tech": ["Python", "Shapely", "pyproj"], "metrics": metrics}
    stage(1, "Data ingestion", ingest)

    # 2 ── preprocessing
    def preprocess():
        n_tx = 0
        for name, s in src.items():
            for f in s.features:
                if f.geometry is not None and s.crs != WORKING_CRS:
                    f.geometry = _project(f.geometry, s.crs, WORKING_CRS)
                    n_tx += 1
            if s.crs:
                s.crs = WORKING_CRS
        keys_fixed, uses_fixed = 0, 0
        for f in src["cadastral"].features:
            k = norm_key(f.props["khasra_no"])
            keys_fixed += k != f.props["khasra_no"]
            f.props["key"] = k
            f.props["land_use_name"] = CODE_USE.get(f.props["land_use"])
        for f in src["revenue"].features:
            k = norm_key(f.props["plot_ref"])
            keys_fixed += k != f.props["plot_ref"]
            f.props["key"] = k
            f.props["land_use_name"] = f.props["classification"]
            uses_fixed += 1
        for f in src["municipal"].features:
            f.props["key"] = norm_key(f.props.get("plot_ref"))
            f.props["land_use_name"] = f.props["usage"]
        seen, dups = set(), 0
        deduped = []
        for f in src["revenue"].features:
            if f.props["key"] in seen:
                dups += 1
                continue
            seen.add(f.props["key"])
            deduped.append(f)
        src["revenue"].features = deduped
        return {"summary": "Everything moves into one projected coordinate system (UTM 44N). Plot references and land-use codes are rewritten to a single vocabulary.",
                "tech": ["pyproj", "GDAL/PROJ", "Python"],
                "metrics": [_metric("Geometries re-projected", n_tx, "EPSG:4326 and EPSG:3857 to EPSG:32644"),
                            _metric("Plot references normalised", keys_fixed, "KH/12, KH 12, 12/KH to KH-0012"),
                            _metric("Land-use values mapped to one scheme", uses_fixed + len(src["cadastral"].features)),
                            _metric("Duplicate revenue entries dropped", dups)]}
    stage(2, "Preprocessing", preprocess)

    # 3 ── AI feature extraction (consumes sample extraction output)
    def extraction():
        ori = src["ori"].features
        conf = [f.props["detection_confidence"] for f in ori]
        low = [f for f in ori if f.props["detection_confidence"] < LOW_DETECTION]
        S["low_ori"] = {f.id for f in low}
        return {"summary": "Parcel boundaries extracted from drone orthophotos arrive with a detection confidence. Low-confidence detections stay in the pipeline but are not trusted to move other layers.",
                "tech": ["Python", "PyTorch", "scikit-learn"],
                "note": "Sample extraction output. No vision model runs in this demo.",
                "metrics": [_metric("Boundaries detected", len(ori)),
                            _metric("Mean detection confidence", round(statistics.mean(conf), 3)),
                            _metric("Low-confidence detections", len(low), f"below {LOW_DETECTION}"),
                            _metric("Building footprints", len(src["buildings"].features))]}
    stage(3, "AI feature extraction", extraction)

    # 4 ── spatial matching
    entities: list[Entity] = []

    def matching():
        cad, ori = src["cadastral"].features, src["ori"].features
        ori_geoms = [f.geometry for f in ori]
        ori_cent = STRtree([g.centroid for g in ori_geoms])
        cad_geoms = [_valid(f.geometry) for f in cad]
        dx = dy = 0.0
        for _ in range(2):  # nearest-centroid vote, refined once
            diffs = []
            for g in cad_geoms:
                c = g.centroid
                j = int(ori_cent.nearest(c))
                oc = ori_geoms[j].centroid
                if abs(oc.x - (c.x + dx)) < 8 and abs(oc.y - (c.y + dy)) < 8:
                    diffs.append((oc.x - c.x, oc.y - c.y))
            dx, dy = float(np.median([d[0] for d in diffs])), float(np.median([d[1] for d in diffs]))
        S["offset"] = (dx, dy)
        from shapely import affinity
        aligned = [affinity.translate(f.geometry, dx, dy) for f in cad]

        # cadastral <-> ORI, greedy one-to-one by IoU
        tree = STRtree(ori_geoms)
        pairs = []
        for ci, g in enumerate(aligned):
            for oi in tree.query(_valid(g)):
                v = iou(g, ori_geoms[int(oi)])
                if v >= 0.30:
                    pairs.append((v, ci, int(oi)))
        pairs.sort(reverse=True)
        used_c, used_o = set(), set()
        ents: dict[int, Entity] = {}
        for v, ci, oi in pairs:
            if ci in used_c or oi in used_o:
                continue
            used_c.add(ci); used_o.add(oi)
            e = Entity(id="", cad=cad[ci], ori=ori[oi], cad_geom=aligned[ci], ori_geom=ori_geoms[oi])
            ents[ci] = e
        for ci, f in enumerate(cad):
            if ci not in ents:
                ents[ci] = Entity(id="", cad=f, cad_geom=aligned[ci])
        entities.extend(ents.values())
        ori_only = 0
        for oi, f in enumerate(ori):
            if oi not in used_o and f.props["detection_confidence"] >= LOW_DETECTION:
                entities.append(Entity(id="", ori=f, ori_geom=f.geometry))
                ori_only += 1
        for e in entities:
            e.key = e.cad.props["key"] if e.cad else None

        # municipal layer: plot reference when present, otherwise geometry
        mun = src["municipal"].features
        by_key = {e.key: e for e in entities if e.key}
        free = []
        for f in mun:
            e = by_key.get(f.props["key"]) if f.props["key"] else None
            if e is not None and e.mun is None and iou(f.geometry, e.match_geom) > 0.2:
                e.mun, e.mun_geom = f, f.geometry
            else:
                free.append(f)
        etree = STRtree([e.match_geom for e in entities])
        cand = []
        for fi, f in enumerate(free):
            for ei in etree.query(_valid(f.geometry)):
                v = iou(f.geometry, entities[int(ei)].match_geom)
                if v >= 0.35 and entities[int(ei)].mun is None:
                    cand.append((v, fi, int(ei)))
        cand.sort(reverse=True)
        done_f = set()
        for v, fi, ei in cand:
            e = entities[ei]
            if fi in done_f or e.mun is not None:
                continue
            done_f.add(fi)
            e.mun, e.mun_geom = free[fi], free[fi].geometry
        for e in entities:
            if e.key is None and e.mun is not None and e.mun.props["key"]:
                e.key = e.mun.props["key"]
        unmatched_mun = len(free) - len(done_f)

        # revenue by key
        by_key = {e.key: e for e in entities if e.key}
        orphan = 0
        for f in src["revenue"].features:
            e = by_key.get(f.props["key"])
            if e is not None and e.rev is None:
                e.rev = f
            else:
                orphan += 1

        # buildings by largest overlap
        etree = STRtree([e.match_geom for e in entities])
        orphan_b = 0
        for b in src["buildings"].features:
            best, best_a = None, 0.0
            for ei in etree.query(b.geometry):
                a = entities[int(ei)].match_geom.intersection(b.geometry).area
                if a > best_a:
                    best, best_a = entities[int(ei)], a
            if best is not None and best_a >= 0.5 * b.geometry.area:
                best.buildings.append(b)
            else:
                orphan_b += 1

        entities.sort(key=lambda e: (e.match_geom.centroid.x, e.match_geom.centroid.y))
        for i, e in enumerate(entities, 1):
            e.id = f"P-{i:04d}"
            if e.cad:
                e.truth_id = e.cad.id.removeprefix("cad-")
            elif e.ori:
                e.truth_id = e.ori.id.removeprefix("ori-")
        full = sum(1 for e in entities if len(e.sources()) >= 4)
        return {"summary": "The cadastral layer is shifted onto the drone-derived boundaries by the median offset between matched parcels, then each layer is linked to a parcel by overlap and, where available, plot reference.",
                "tech": ["GeoAI similarity scoring", "Shapely STRtree", "GeoPandas-style spatial joins"],
                "metrics": [_metric("Parcels formed", len(entities)),
                            _metric("Cadastral shift removed", f"{dx:+.2f} m E, {dy:+.2f} m N", "median of matched parcels"),
                            _metric("Parcels seen in four or more sources", full),
                            _metric("Boundaries found only by ORI", ori_only, "gaps in the cadastral map"),
                            _metric("Records with no parcel", orphan + unmatched_mun + orphan_b,
                                    f"{orphan} revenue, {unmatched_mun} municipal, {orphan_b} building")]}
    stage(4, "Spatial matching", matching)
    dx, dy = S["offset"]

    # 5 ── harmonisation
    def harmonise():
        invalid_fixed = snapped = 0
        pre_overlaps = _overlap_pairs([e.match_geom for e in entities])
        for e in entities:
            e.edits.append(f"cadastre shifted by ({dx:+.2f}, {dy:+.2f}) m") if e.cad else None
            g = e.cad_geom
            if g is not None and not g.is_valid:
                pts = list(g.exterior.coords[:-1])
                fixed = Polygon(pts).convex_hull if len(pts) <= 6 else _largest(make_valid(g))
                g, invalid_fixed = fixed, invalid_fixed + 1
                e.edits.append("self-intersecting ring repaired")
            if g is not None and e.ori_geom is not None and e.ori.props["detection_confidence"] >= LOW_DETECTION:
                from shapely import snap
                s = snap(g, e.ori_geom, 0.8)
                if not s.equals(g):
                    g, snapped = s, snapped + 1
                    e.edits.append("vertices snapped to ORI boundary")
            e.final_geom = set_precision(g if g is not None else e.ori_geom, 0.01)
        trimmed = _trim_overlaps(entities)
        post_overlaps = _overlap_pairs([e.final_geom for e in entities])

        mapped = 0
        for e in entities:
            e.values["owner"] = {k: v for k, v in (
                ("revenue", e.rev.props["owner_name"] if e.rev else None),
                ("cadastral", e.cad.props["owner"] if e.cad else None),
                ("municipal", e.mun.props["assessed_owner"] if e.mun else None)) if v}
            e.values["land_use"] = {k: v for k, v in (
                ("revenue", e.rev.props["land_use_name"] if e.rev else None),
                ("cadastral", e.cad.props["land_use_name"] if e.cad else None),
                ("municipal", e.mun.props["land_use_name"] if e.mun else None)) if v}
            e.values["area_sqm"] = {k: v for k, v in (
                ("revenue", e.rev.props["area_sqm"] if e.rev else None),
                ("cadastral", e.cad.props["area_sqm"] if e.cad else None)) if v}
            e.values["geometry_area_sqm"] = round(e.final_geom.area, 1)
            mapped += len(e.values["owner"]) + len(e.values["land_use"])

        new_build = area_delta = cad_gap = 0
        for e in entities:
            vac = [v == "Vacant" for v in e.values["land_use"].values()]
            if e.buildings and vac and all(vac):
                e.changes.append("Building footprint on land recorded as vacant")
                new_build += 1
            ga = e.values["geometry_area_sqm"]
            rec = list(e.values["area_sqm"].values())
            if rec and max(abs(r - ga) / ga for r in rec) > 0.12:
                e.changes.append("Recorded area differs from surveyed geometry")
                area_delta += 1
            if e.cad is None:
                e.changes.append("Boundary detected from imagery but missing in cadastral map")
                cad_gap += 1
        return {"summary": "Geometry is repaired and snapped to the drone boundaries where those are trusted, overlaps between neighbours are trimmed, owner names and land-use values are lined up side by side, and differences from the records are listed as changes.",
                "tech": ["Shapely", "GDAL", "Rasterio", "PostGIS (target store)"],
                "metrics": [_metric("Self-intersecting rings repaired", invalid_fixed),
                            _metric("Boundaries snapped to ORI", snapped, "0.8 m tolerance"),
                            _metric("Neighbour overlaps", f"{len(pre_overlaps)} to {len(post_overlaps)}", f"{trimmed} trimmed"),
                            _metric("Attribute values mapped", mapped),
                            _metric("Changes detected", new_build + area_delta + cad_gap,
                                    f"{new_build} new construction, {area_delta} area mismatch, {cad_gap} cadastral gap")]}
    stage(5, "Harmonisation engine", harmonise)

    # 6 ── conflict engine
    def conflicts():
        auto = flagged = 0
        for e in entities:
            e.conflicts = _conflicts(e)
            auto += sum(c["status"] == "resolved" for c in e.conflicts)
            flagged += sum(c["status"] == "flagged" for c in e.conflicts)
        by_field: dict[str, int] = {}
        for e in entities:
            for c in e.conflicts:
                by_field[c["field"]] = by_field.get(c["field"], 0) + 1
        return {"summary": "Where sources disagree, source-aware rules pick a value or hand the decision to a person. Ownership is never settled automatically; a suggested value is attached for the reviewer.",
                "tech": ["Rule engine (Python)", "Confidence rules"],
                "metrics": [_metric("Conflicts found", auto + flagged, ", ".join(f"{v} {k.replace('_sqm', '').replace('_', ' ')}" for k, v in sorted(by_field.items()))),
                            _metric("Resolved by rule", auto),
                            _metric("Flagged for human validation", flagged)]}
    stage(6, "Conflict engine", conflicts)

    # 7 ── confidence + output
    def output():
        for e in entities:
            _score(e)
        auto = sum(e.status == "auto_accepted" for e in entities)
        scores = [e.confidence for e in entities]
        return {"summary": "Each parcel gets a confidence score built from geometric agreement, attribute agreement, extraction quality and how many sources back it. High-scoring parcels with no open conflict are accepted; the rest go to a review queue.",
                "tech": ["FastAPI", "React + WebGIS", "PostgreSQL/PostGIS (target)", "Docker"],
                "metrics": [_metric("Harmonised land records", len(entities)),
                            _metric("Accepted automatically", auto, f"score {AUTO_ACCEPT:.2f} or higher, no open conflict"),
                            _metric("Sent to human validation", len(entities) - auto),
                            _metric("Median confidence", round(statistics.median(scores), 3))]}
    stage(7, "Output and serving", output)

    return RunResult(ward.seed, size, stages, entities, S["raw_layers"], ll, _benchmark(ward, entities), (dx, dy))


# ───────────────────────── rules ─────────────────────────
def _largest(g: BaseGeometry) -> BaseGeometry:
    parts = [p for p in getattr(g, "geoms", [g]) if p.geom_type == "Polygon"]
    return max(parts, key=lambda p: p.area)


def _overlap_pairs(geoms: list[BaseGeometry], min_area: float = 0.3):
    tree = STRtree(geoms)
    out = []
    for i, g in enumerate(geoms):
        for j in tree.query(g):
            j = int(j)
            if j > i and g.intersection(geoms[j]).area > min_area:
                out.append((i, j))
    return out


def _trim_overlaps(entities: list[Entity]) -> int:
    geoms = [e.final_geom for e in entities]
    n = 0
    for i, j in _overlap_pairs(geoms):
        inter = geoms[i].intersection(geoms[j])
        if inter.area > 4.0:
            continue  # large overlap is a real disagreement, leave for review
        ci = entities[i].ori.props["detection_confidence"] if entities[i].ori else 0
        cj = entities[j].ori.props["detection_confidence"] if entities[j].ori else 0
        lo = j if cj <= ci else i
        d = geoms[lo].difference(inter)
        if not d.is_empty:
            geoms[lo] = _largest(d)
            entities[lo].final_geom = geoms[lo]
            entities[lo].edits.append(f"overlap with neighbour trimmed ({inter.area:.1f} m²)")
            n += 1
    return n


def _conflicts(e: Entity) -> list[dict]:
    out = []
    # owner: group by similarity; any split is flagged, majority attached as suggestion
    owners = e.values["owner"]
    if len(owners) >= 2:
        names = list(owners.items())
        groups: list[list[tuple[str, str]]] = []
        for s, n in names:
            for g in groups:
                if owner_sim(n, g[0][1]) >= OWNER_SAME:
                    g.append((s, n)); break
            else:
                groups.append([(s, n)])
        if len(groups) > 1:
            groups.sort(key=len, reverse=True)
            sug = groups[0]
            out.append({"field": "owner", "kind": "Owner differs between records", "values": owners,
                        "status": "flagged",
                        "suggestion": {"source": sug[0][0], "value": sug[0][1],
                                       "rule": "Majority of sources" if len(sug) > 1 else "Revenue record is the legal register"}
                        if len(sug) > 1 or "revenue" in owners else None})
    # land use
    uses = e.values["land_use"]
    if len(set(uses.values())) > 1:
        counts: dict[str, int] = {}
        for v in uses.values():
            counts[v] = counts.get(v, 0) + 1
        top, n = max(counts.items(), key=lambda kv: kv[1])
        if n >= 2 and n > len(uses) / 2:
            src = next(s for s, v in uses.items() if v == top)
            out.append({"field": "land_use", "kind": "Land use differs between records", "values": uses,
                        "status": "resolved", "resolution": {"source": src, "value": top, "rule": "Majority of sources"}})
        else:
            out.append({"field": "land_use", "kind": "Land use differs between records", "values": uses, "status": "flagged",
                        "suggestion": None})
    # area vs geometry
    ga = e.values["geometry_area_sqm"]
    rec = e.values["area_sqm"]
    if rec and max(abs(v - ga) / ga for v in rec.values()) > 0.12:
        trusted = e.ori is not None and e.ori.props["detection_confidence"] >= LOW_DETECTION
        c = {"field": "area_sqm", "kind": "Recorded area differs from surveyed geometry",
             "values": {**rec, "geometry": ga}}
        if trusted:
            c.update(status="resolved", resolution={"source": "geometry", "value": ga, "rule": "Use area of the surveyed boundary"})
        else:
            c.update(status="flagged", suggestion=None)
        out.append(c)
    # boundary disagreement between cadastre and ORI
    if e.cad_geom is not None and e.ori_geom is not None and e.ori.props["detection_confidence"] >= LOW_DETECTION:
        v = iou(e.final_geom, e.ori_geom)
        if v < 0.75:
            out.append({"field": "geometry", "kind": "Cadastral and drone boundaries disagree",
                        "values": {"overlap_iou": round(v, 3)}, "status": "flagged", "suggestion": None})
    # new construction on vacant land
    if any("vacant" in c.lower() for c in e.changes):
        out.append({"field": "land_use", "kind": "Building found on land recorded as vacant",
                    "values": {**uses, "buildings": len(e.buildings)}, "status": "flagged", "suggestion": None})
    return out


def _score(e: Entity) -> None:
    present = len(e.sources())
    ori_conf = e.ori.props["detection_confidence"] if e.ori else None
    if e.final_geom is not None and e.ori_geom is not None:
        geo = float(np.clip((iou(e.final_geom, e.ori_geom) - 0.5) / 0.45, 0, 1))
    else:
        geo = 0.5
    owners = list(e.values["owner"].values())
    sims = [owner_sim(a, b) for i, a in enumerate(owners) for b in owners[i + 1:]]
    owner_ok = float(np.mean([s >= OWNER_SAME for s in sims])) if sims else 0.5
    uses = list(e.values["land_use"].values())
    use_ok = (max(uses.count(u) for u in set(uses)) / len(uses)) if len(uses) > 1 else 0.5
    attr = 0.65 * owner_ok + 0.35 * use_ok
    ext = ori_conf if ori_conf is not None else 0.5
    comp = min(present, 5) / 5
    e.components = {"geometry": round(geo, 3), "attributes": round(attr, 3),
                    "extraction": round(ext, 3), "coverage": round(comp, 3)}
    base = 0.38 * geo + 0.30 * attr + 0.14 * ext + 0.18 * comp
    flagged = [c for c in e.conflicts if c["status"] == "flagged"]
    e.confidence = round(float(np.clip(base - min(0.30, 0.10 * len(flagged)), 0, 1)), 3)
    e.status = "auto_accepted" if (e.confidence >= AUTO_ACCEPT and not flagged) else "needs_review"
    e.values["final"] = _final_values(e)


def _final_values(e: Entity) -> dict:
    out = {"owner": None, "owner_source": None, "land_use": None, "area_sqm": e.values["geometry_area_sqm"]}
    for c in e.conflicts:
        if c["field"] == "owner" and c.get("suggestion"):
            out["owner"], out["owner_source"] = c["suggestion"]["value"], c["suggestion"]["source"]
        if c["field"] == "land_use" and c["status"] == "resolved":
            out["land_use"] = c["resolution"]["value"]
    if out["owner"] is None:
        for s in ("revenue", "cadastral", "municipal"):
            if s in e.values["owner"]:
                out["owner"], out["owner_source"] = e.values["owner"][s], s
                break
    if out["land_use"] is None:
        for s in ("revenue", "cadastral", "municipal"):
            if s in e.values["land_use"]:
                out["land_use"] = e.values["land_use"][s]
                break
    return out


# ───────────────────────── benchmark against the known answer ─────────────────────────
def _benchmark(ward: Ward, entities: list[Entity]) -> dict:
    """Score the run against the synthetic ground truth. Only possible because the ward is generated."""
    truth = ward.truth
    raw, new = [], []
    owner_total = owner_right = 0
    use_right = use_total = 0
    err_total = err_caught = 0
    auto = auto_ok = 0
    for e in entities:
        t = truth.get(e.truth_id or "")
        if not t:
            continue
        g_new = iou(e.final_geom, t["geometry"])
        new.append(g_new)
        if e.cad is not None:
            raw.append(iou(e.cad.geometry, t["geometry"]))
        f = e.values["final"]
        o_ok = owner_sim(f["owner"], t["owner"]) >= OWNER_SAME
        u_ok = f["land_use"] == t["use"]
        owner_total += 1; owner_right += o_ok
        use_total += 1; use_right += u_ok
        wrong = any(owner_sim(v, t["owner"]) < OWNER_SAME for v in e.values["owner"].values()) or \
            any(v != t["use"] for v in e.values["land_use"].values())
        if wrong:
            err_total += 1
            err_caught += bool(e.conflicts)
        if e.status == "auto_accepted":
            auto += 1
            auto_ok += bool(o_ok and u_ok and g_new >= 0.85)
    n = len(new)
    return {
        "note": "Computed on a synthetic ward with a known answer. These are not claims about real land records.",
        "parcels": len(entities),
        "geometry_iou_as_received": round(float(np.mean(raw)), 3) if raw else None,
        "geometry_iou_harmonised": round(float(np.mean(new)), 3) if new else None,
        "geometry_ge_90_as_received": round(sum(v >= 0.9 for v in raw) / len(raw), 3) if raw else None,
        "geometry_ge_90_harmonised": round(sum(v >= 0.9 for v in new) / n, 3) if n else None,
        "owner_correct": round(owner_right / owner_total, 3) if owner_total else None,
        "land_use_correct": round(use_right / use_total, 3) if use_total else None,
        "records_with_source_errors": err_total,
        "source_errors_surfaced": round(err_caught / err_total, 3) if err_total else None,
        "auto_accepted": auto,
        "auto_accepted_fully_correct": round(auto_ok / auto, 3) if auto else None,
        "sent_to_review": len(entities) - auto,
    }
