"""Synthetic ward generator.

Builds one "true" set of land parcels and then derives the messy departmental
layers from it, each with its own CRS, positional error, schema and mistakes.
Nothing here is real land-record data; it exists so the pipeline can be run and
measured against a known answer.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field

from pyproj import Transformer
from shapely import affinity
from shapely.geometry import Polygon, box
from shapely.geometry.base import BaseGeometry

WORKING_CRS = "EPSG:32644"  # UTM 44N
SIZES = {"small": (2, 2), "medium": (3, 3), "large": (4, 4)}  # blocks (cols, rows)

FIRST = ["Ramesh", "Sunita", "Anil", "Meena", "Rajesh", "Pooja", "Vikram", "Kavita",
         "Mohammad", "Farida", "Deepak", "Neha", "Suresh", "Anita", "Imran", "Geeta",
         "Harish", "Shalini", "Arjun", "Lata"]
LAST = ["Sharma", "Verma", "Gupta", "Yadav", "Srivastava", "Mishra", "Khan", "Ansari",
        "Tiwari", "Pandey", "Singh", "Agarwal", "Saxena", "Rastogi", "Siddiqui"]
USES = ["Residential", "Commercial", "Mixed use", "Public", "Vacant"]
USE_WEIGHTS = [60, 15, 9, 6, 10]
CAD_CODE = {"Residential": "RES", "Commercial": "COM", "Mixed use": "MIX", "Public": "PUB", "Vacant": "VAC"}


@dataclass
class Feature:
    id: str
    geometry: BaseGeometry | None
    props: dict = field(default_factory=dict)


@dataclass
class Source:
    name: str
    title: str
    crs: str | None
    features: list[Feature]


@dataclass
class Ward:
    seed: int
    truth: dict[str, dict]            # parcel id -> {geometry (UTM), owner, use, area}
    sources: dict[str, Source]
    origin_lonlat: tuple[float, float]


def _split(rect: Polygon, rng: random.Random, min_area: float, out: list[Polygon]) -> None:
    minx, miny, maxx, maxy = rect.bounds
    w, h = maxx - minx, maxy - miny
    if rect.area < min_area * 2.2 or (rng.random() < 0.12 and rect.area < min_area * 5):
        out.append(rect)
        return
    t = rng.uniform(0.38, 0.62)
    if w >= h:
        x = minx + w * t
        _split(box(minx, miny, x, maxy), rng, min_area, out)
        _split(box(x, miny, maxx, maxy), rng, min_area, out)
    else:
        y = miny + h * t
        _split(box(minx, miny, maxx, y), rng, min_area, out)
        _split(box(minx, y, maxx, maxy), rng, min_area, out)


def _owner(rng: random.Random) -> str:
    return f"{rng.choice(FIRST)} {rng.choice(LAST)}"


def _owner_variant(name: str, rng: random.Random) -> str:
    """Spelling, initials, honorifics: the usual ways one person becomes three records."""
    first, last = name.split(" ", 1)
    pick = rng.random()
    if pick < 0.30:
        return f"{first[0]}. {last}"
    if pick < 0.50:
        return f"Shri {first} {last}" if first[-1] not in "aiu" else f"Smt. {first} {last}"
    if pick < 0.70:
        return name.upper()
    if pick < 0.85:
        return f"{first} {last[:-1]}" if len(last) > 4 else name
    return f"{last}, {first}"


def _jitter(poly: Polygon, rng: random.Random, sigma: float, dx: float = 0.0, dy: float = 0.0) -> Polygon:
    pts = [(x + rng.gauss(dx, sigma), y + rng.gauss(dy, sigma)) for x, y in poly.exterior.coords[:-1]]
    return Polygon(pts)


def _bowtie(poly: Polygon) -> Polygon:
    pts = list(poly.exterior.coords[:-1])
    pts[1], pts[2] = pts[2], pts[1]
    return Polygon(pts)


def generate_ward(seed: int = 7, size: str = "medium") -> Ward:
    rng = random.Random(seed)
    cols, rows = SIZES[size]
    to_utm = Transformer.from_crs("EPSG:4326", WORKING_CRS, always_xy=True)
    to_ll = Transformer.from_crs(WORKING_CRS, "EPSG:4326", always_xy=True)
    to_3857 = Transformer.from_crs(WORKING_CRS, "EPSG:3857", always_xy=True)
    ox, oy = to_utm.transform(80.9462, 26.8467)  # an arbitrary point in Lucknow

    # --- true parcels: blocks separated by 12 m lanes, each block split into plots
    block_w, block_h, lane = 96.0, 78.0, 12.0
    parcels: list[Polygon] = []
    for c in range(cols):
        for r in range(rows):
            x0 = ox + c * (block_w + lane)
            y0 = oy + r * (block_h + lane)
            _split(box(x0, y0, x0 + block_w, y0 + block_h), rng, 260.0, parcels)
    pivot = (ox + cols * (block_w + lane) / 2, oy + rows * (block_h + lane) / 2)
    parcels = [affinity.rotate(p, 11, origin=pivot) for p in parcels]

    truth: dict[str, dict] = {}
    for i, g in enumerate(parcels, 1):
        pid = f"KH-{i:04d}"
        truth[pid] = {
            "geometry": g,
            "owner": _owner(rng),
            "use": rng.choices(USES, USE_WEIGHTS)[0],
            "area": g.area,
        }

    # --- cadastral map: EPSG:4326, one global survey offset, a few topology errors
    cad_dx, cad_dy = 1.9, -1.3
    cad: list[Feature] = []
    for pid, t in truth.items():
        if rng.random() < 0.03:
            continue  # sheet never digitised
        g = _jitter(t["geometry"], rng, 0.22, cad_dx, cad_dy)
        r = rng.random()
        if r < 0.06:
            g = _bowtie(g)
        elif r < 0.10:
            g = g.buffer(-0.35, join_style=2)
        area_rec = t["area"] * (1 + rng.gauss(0, 0.025))
        if rng.random() < 0.04:
            area_rec *= rng.choice([0.72, 1.3])
        key = pid if rng.random() > 0.05 else pid.replace("KH-", "KH/")
        owner = _owner_variant(t["owner"], rng) if rng.random() < 0.45 else t["owner"]
        if g.is_empty:
            continue
        ll = Polygon([to_ll.transform(x, y) for x, y in g.exterior.coords])
        cad.append(Feature(f"cad-{pid}", ll, {
            "khasra_no": key, "owner": owner, "area_sqm": round(area_rec, 1),
            "land_use": CAD_CODE[t["use"]],
        }))

    # --- AI-extracted boundaries from drone orthophoto (UTM, survey-grade registration)
    ori: list[Feature] = []
    for pid, t in truth.items():
        if rng.random() < 0.07:
            continue  # occluded by tree canopy
        g = _jitter(t["geometry"], rng, 0.30)
        conf = min(0.99, max(0.40, rng.betavariate(9, 1.6)))
        if conf < 0.62:
            g = _jitter(t["geometry"], rng, 1.2)
        ori.append(Feature(f"ori-{pid}", g, {"detection_confidence": round(conf, 3)}))

    # --- building footprints; a few new constructions on land recorded as vacant
    bld: list[Feature] = []
    for pid, t in truth.items():
        built = t["use"] != "Vacant" or rng.random() < 0.22
        if not built:
            continue
        inner = t["geometry"].buffer(-2.8, join_style=2)
        if inner.is_empty or inner.area < 40:
            continue
        minx, miny, maxx, maxy = inner.bounds
        fp = box(minx, miny, minx + (maxx - minx) * rng.uniform(0.55, 0.9),
                 miny + (maxy - miny) * rng.uniform(0.55, 0.9))
        fp = affinity.rotate(fp, 11, origin=inner.centroid)
        fp = fp.intersection(inner)
        if fp.is_empty or fp.geom_type != "Polygon":
            continue
        bld.append(Feature(f"bld-{pid}", _jitter(fp, rng, 0.25), {"storeys": rng.choice([1, 2, 2, 3])}))

    # --- municipal layer: Web Mercator, coarser, own attribute names
    mun: list[Feature] = []
    for i, (pid, t) in enumerate(truth.items(), 1):
        if rng.random() < 0.10:
            continue
        g = _jitter(t["geometry"], rng, 0.9, 0.4, 0.6)
        use = t["use"] if rng.random() > 0.07 else rng.choice(USES)
        wm = Polygon([to_3857.transform(x, y) for x, y in g.exterior.coords])
        mun.append(Feature(f"mun-{pid}", wm, {
            "property_id": f"LKO/W14/{i:05d}", "ward": "Ward 14",
            "usage": use, "assessed_owner": _owner_variant(t["owner"], rng) if rng.random() < 0.4 else t["owner"],
            "_pid": pid,  # kept only to synthesise a join key below; never read by the pipeline
        }))
    for f in mun:  # municipal records carry a plot reference ~70% of the time
        pid = f.props.pop("_pid")
        f.props["plot_ref"] = pid if rng.random() < 0.7 else None

    # --- revenue records: no geometry at all
    rev: list[Feature] = []
    for pid, t in truth.items():
        if rng.random() < 0.04:
            continue
        num = int(pid[3:])
        ref = rng.choice([pid, f"KH {num}", f"{num}/KH", pid.lower()])
        owner = t["owner"]
        if rng.random() < 0.08:
            owner = _owner(rng)  # transfer not yet mutated in the cadastre
        elif rng.random() < 0.4:
            owner = _owner_variant(owner, rng)
        use = t["use"] if rng.random() > 0.06 else rng.choice(USES)
        area = t["area"] * (1 + rng.gauss(0, 0.02))
        rev.append(Feature(f"rev-{pid}", None, {
            "plot_ref": ref, "owner_name": owner, "area_sqm": round(area, 1), "classification": use,
        }))
        if rng.random() < 0.02:  # duplicate entry
            rev.append(Feature(f"rev-{pid}-dup", None, dict(rev[-1].props)))

    sources = {
        "cadastral": Source("cadastral", "Cadastral map", "EPSG:4326", cad),
        "ori": Source("ori", "Drone ORI, AI-extracted boundaries", WORKING_CRS, ori),
        "buildings": Source("buildings", "Building footprints", WORKING_CRS, bld),
        "municipal": Source("municipal", "Municipal GIS layer", "EPSG:3857", mun),
        "revenue": Source("revenue", "Revenue records", None, rev),
    }
    lon, lat = to_ll.transform(ox, oy)
    return Ward(seed, truth, sources, (lon, lat))
