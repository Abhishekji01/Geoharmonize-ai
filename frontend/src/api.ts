export type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: any };
export type Feature<P = Record<string, any>> = { type: "Feature"; id?: string | number; properties: P; geometry: Geometry };
export type FC<P = Record<string, any>> = { type: "FeatureCollection"; features: Feature<P>[] };

export type ParcelProps = {
  id: string; key: string | null; owner: string | null; land_use: string | null; area_sqm: number;
  confidence: number; status: "auto_accepted" | "needs_review" | "validated" | "rejected";
  sources: string[]; open_conflicts: number; resolved_conflicts: number; changes: string[];
  n_edits: number; review_reasons: string[];
};
export type Metric = { label: string; value: string | number; note?: string };
export type Stage = { n: number; name: string; ms: number; summary: string; tech: string[]; note?: string; metrics: Metric[] };
export type Benchmark = Record<string, number | string | null>;
export type RunSummary = {
  id: string; seed: number; size: string; parcels: number; bounds: [number, number, number, number];
  cadastral_shift_m: { east: number; north: number }; auto_accept_threshold: number; origin_utm: [number, number]; crs: string;
  status_counts: Record<string, number>; stages: Stage[]; benchmark: Benchmark;
};
export type Conflict = {
  field: string; kind: string; values: Record<string, string | number>; status: "resolved" | "flagged";
  resolution?: { source: string; value: string | number; rule: string };
  suggestion?: { source: string; value: string; rule: string } | null;
};
export type ParcelDetail = ParcelProps & {
  values: { owner: Record<string, string>; land_use: Record<string, string>; area_sqm: Record<string, number>; geometry_area_sqm: number };
  conflicts: Conflict[]; components: Record<string, number>; edits: string[]; detection_confidence: number | null;
  owner_agrees: Record<string, boolean>; land_use_agrees: Record<string, boolean>;
  buildings: number; decision: { decision: "accept" | "reject"; resolutions: Record<string, string>; note: string; decided_at: string } | null;
};
export type Audit = { ok: boolean; length: number; head: string | null; broken_at: number | null; recent: { seq: number; at: string; run: string; parcel: string; action: string; hash: string }[] };
export type CatalogRow = { name: string; status: "modelled" | "extraction" | "planned"; note: string };

const BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ? String(body.detail) : `Request failed (${res.status})`);
  }
  return res.json();
}

const cache = new Map<string, Promise<any>>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, load().catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key)!;
}

export const api = {
  catalog: () => cached("catalog", () => fetch(`${BASE_URL}/api/catalog`).then((r) => j<CatalogRow[]>(r))),
  createRun: (seed: number, size: string) =>
    fetch(`${BASE_URL}/api/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed, size }) }).then((r) => j<{ id: string }>(r)),
  summary: (id: string) => fetch(`${BASE_URL}/api/runs/${id}`, { cache: "no-store" }).then((r) => j<RunSummary>(r)),
  layer: (id: string, name: string) => cached(`${id}/${name}`, () => fetch(`${BASE_URL}/api/runs/${id}/layers/${name}`).then((r) => j<FC>(r))),
  harmonised: (id: string) => fetch(`${BASE_URL}/api/runs/${id}/layers/harmonized`, { cache: "no-store" }).then((r) => j<FC<ParcelProps>>(r)),
  parcel: (id: string, pid: string) => fetch(`${BASE_URL}/api/runs/${id}/parcels/${pid}`, { cache: "no-store" }).then((r) => j<ParcelDetail>(r)),
  queue: (id: string) => fetch(`${BASE_URL}/api/runs/${id}/review`, { cache: "no-store" }).then((r) => j<(ParcelProps & { decision: string | null })[]>(r)),
  review: (id: string, pid: string, body: { decision: "accept" | "reject"; resolutions: Record<string, string>; note: string }) =>
    fetch(`${BASE_URL}/api/runs/${id}/review/${pid}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => j<ParcelProps>(r)),
  undo: (id: string, pid: string) => fetch(`${BASE_URL}/api/runs/${id}/review/${pid}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
  audit: () => fetch(`${BASE_URL}/api/audit`, { cache: "no-store" }).then((r) => j<Audit>(r)),
  exportUrl: (id: string) => `${BASE_URL}/api/runs/${id}/export.geojson`,
};
