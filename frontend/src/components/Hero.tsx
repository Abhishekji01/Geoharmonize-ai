import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { WardData } from "../hooks";
import { prefersReducedMotion } from "../hooks";
import { geomBox, makeProj } from "../geo";
import { MapView, type LayerSpec } from "./MapView";
import { RegisterCard } from "./RegisterCard";
import { C } from "../theme";

/** The sheet itself: two copies of the ward under one frame, split by a draggable line. */
export function Hero({ ward }: { ward: WardData }) {
  const { summary, harm } = ward;
  const [pct, setPct] = useState(prefersReducedMotion() ? 46 : 100);
  const [selected, setSelected] = useState<string | null>(null);
  const [wide, setWide] = useState(typeof window !== "undefined" && window.innerWidth > 1020);
  const touched = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(1200);

  // A plot where the owner records disagree, nearest the middle of the ward, becomes the first thing you see.
  const example = useMemo(() => {
    const proj = makeProj(summary.bounds);
    let best: string | null = null, bd = Infinity;
    for (const f of harm.features) {
      if (!f.properties.review_reasons[0]?.startsWith("Owner")) continue;
      const [x0, y0, x1, y1] = geomBox(f.geometry, proj);
      const d = Math.hypot((x0 + x1) / 2, (y0 + y1) / 2);
      if (d < bd) { bd = d; best = f.properties.id; }
    }
    return best;
  }, [harm, summary]);

  useEffect(() => {
    const ro = new ResizeObserver(() => setBoxW(box.current?.clientWidth ?? 1200));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const on = () => setWide(window.innerWidth > 1020);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  // One reveal on load: the line sweeps across, the layers settle, and the example plot opens.
  useEffect(() => {
    if (prefersReducedMotion()) { setSelected(example); return; }
    let raf = 0;
    const t0 = performance.now() + 600, dur = 2600;
    const tick = (t: number) => {
      if (touched.current) return;
      const p = Math.min(1, Math.max(0, (t - t0) / dur));
      const e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
      setPct(100 - 54 * e);
      if (p < 1) raf = requestAnimationFrame(tick); else setSelected((s) => s ?? example);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [example]);

  const INSET = 500;
  const left = wide ? INSET : 0;
  const px = left + (pct / 100) * (boxW - left); // split position in pixels, measured across the ward area
  const move = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    touched.current = true;
    setPct(Math.min(97, Math.max(3, ((clientX - r.left - left) / (r.width - left)) * 100)));
  };

  const invisible: LayerSpec = { id: "hit", data: harm, interactive: true, style: () => ({ fill: "#000", fillOpacity: 0 }) };
  const received = useMemo<LayerSpec[]>(() => [
    { id: "bld", data: ward.bld, style: () => ({ fill: C.buildings, fillOpacity: 0.3 }) },
    { id: "cad", data: ward.cad, style: () => ({ fill: C.cadastral, fillOpacity: 0.05, stroke: C.cadastral, width: 1.3 }) },
    { id: "ori", data: ward.ori, style: () => ({ stroke: C.ori, width: 1.3 }) },
    invisible,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [ward]);
  const harmonised = useMemo<LayerSpec[]>(() => [
    { id: "bld", data: ward.bld, style: () => ({ fill: C.buildings, fillOpacity: 0.3 }) },
    { id: "h", data: harm, interactive: true, style: (f) => f.properties.status === "needs_review"
      ? { fill: "pat:red", stroke: C.flag, width: 1.6 }
      : { fill: "#E2F1E8", stroke: C.ok, width: 1.1 } },
  ], [ward, harm]);

  const inset = wide ? { l: INSET, r: 0, t: 0, b: 0 } : undefined;

  return (
    <section className="sheet" aria-label="Sample ward, as received and harmonized">
      <div className="sheet-map" ref={box}>
        <MapView bounds={summary.bounds} layers={received} origin={summary.origin_utm} furniture isStatic inset={inset}
          selectedId={selected} onSelect={setSelected} label="Ward as received" />
        <div className="sheet-over" style={{ clipPath: `inset(0 0 0 ${px}px)` }}>
          <MapView bounds={summary.bounds} layers={harmonised} origin={summary.origin_utm} furniture isStatic inset={inset}
            selectedId={selected} onSelect={setSelected} label="Ward harmonized" />
        </div>
        <div className="split-line" style={{ left: px }}>
          <span className="tag l">As received</span>
          <span className="tag r">Harmonized</span>
        </div>
        <div
          className="split-handle" style={{ left: px, top: wide ? "42%" : "50%" }} role="slider" tabIndex={0}
          aria-label="Compare layers as received with the harmonized record" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
          onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); move(e.clientX); }}
          onPointerMove={(e) => { if (e.buttons) move(e.clientX); }}
          onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); touched.current = true; setPct((p) => Math.min(97, Math.max(3, p + (e.key === "ArrowLeft" ? -4 : 4)))); } }}
        ><i /></div>
      </div>

      <div className="legend-box">
        <h1>Four departments. Four maps of the same plots.</h1>
        <p>GeoHarmonize AI lines up cadastral maps, revenue records, drone imagery and municipal layers into one land record and scores every parcel for confidence. Officers review only what the system can't settle.</p>
        <div className="actions">
          <Link to="/workbench" className="btn">Open the workbench</Link>
          <a href="#stages" className="btn ghost">See the seven stages</a>
        </div>
        <dl className="titleblock">
          <div><dt>Ward</dt><dd>Sample, {summary.parcels} parcels, synthetic</dd></div>
          <div><dt>Datum</dt><dd>{summary.crs}, UTM 44N</dd></div>
        </dl>
      </div>
      <RegisterCard runId={summary.id} id={selected} className="sheet-card" layout={wide ? "row" : "stack"} />
    </section>
  );
}
