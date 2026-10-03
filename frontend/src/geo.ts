import type { Feature, FC, Geometry } from "./api";

export type Bounds = [number, number, number, number];
export type Proj = { to: (lon: number, lat: number) => [number, number]; w: number; h: number; key: string };

/** Local equirectangular projection in metres, origin at the bounds centre, y pointing down. */
export function makeProj(b: Bounds): Proj {
  const lon0 = (b[0] + b[2]) / 2, lat0 = (b[1] + b[3]) / 2;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
  return {
    to: (lon, lat) => [(lon - lon0) * kx, -(lat - lat0) * ky],
    w: (b[2] - b[0]) * kx, h: (b[3] - b[1]) * ky, key: b.join(","),
  };
}

function ring(r: number[][], p: Proj): string {
  return r.map(([x, y], i) => { const [px, py] = p.to(x, y); return `${i ? "L" : "M"}${px.toFixed(2)} ${py.toFixed(2)}`; }).join("") + "Z";
}
export function geomPath(g: Geometry, p: Proj): string {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.map((poly: number[][][]) => poly.map((r) => ring(r, p)).join("")).join("");
}
export function geomBox(g: Geometry, p: Proj): [number, number, number, number] {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys) for (const [lon, lat] of poly[0]) {
    const [x, y] = p.to(lon, lat);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

const memo = new WeakMap<FC, Map<string, string[]>>();
export function pathsFor(fc: FC, p: Proj): string[] {
  let m = memo.get(fc);
  if (!m) memo.set(fc, (m = new Map()));
  let out = m.get(p.key);
  if (!out) m.set(p.key, (out = fc.features.map((f: Feature) => geomPath(f.geometry, p))));
  return out;
}
