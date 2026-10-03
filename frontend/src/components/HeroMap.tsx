import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { WardData } from "../hooks";
import { prefersReducedMotion } from "../hooks";
import { makeProj, pathsFor } from "../geo";
import { C, confidenceFill } from "../theme";

/** The ward drawn twice, split by a draggable line: layers as received on the left, the harmonized record on the right. */
export function HeroMap({ ward }: { ward: WardData }) {
  const uid = useId().replace(/:/g, "");
  const proj = useMemo(() => makeProj(ward.summary.bounds), [ward]);
  const [pct, setPct] = useState(prefersReducedMotion() ? 44 : 100);
  const touched = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  // one reveal on load: the line sweeps across and the layers settle into place
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const t0 = performance.now() + 700, from = 100, to = 44, dur = 2600;
    const tick = (t: number) => {
      if (touched.current) return;
      const p = Math.min(1, Math.max(0, (t - t0) / dur));
      const e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
      setPct(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pad = 14;
  const x0 = -proj.w / 2 - pad, y0 = -proj.h / 2 - pad, W = proj.w + pad * 2, H = proj.h + pad * 2;
  const splitX = x0 + (W * pct) / 100;

  const move = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    touched.current = true;
    setPct(Math.min(97, Math.max(3, ((clientX - r.left) / r.width) * 100)));
  };

  const cad = pathsFor(ward.cad, proj), ori = pathsFor(ward.ori, proj), bld = pathsFor(ward.bld, proj), harm = pathsFor(ward.harm, proj);

  return (
    <div className="hero-map" ref={box}>
      <svg viewBox={`${x0} ${y0} ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-label="Sample ward shown as received on the left and harmonized on the right">
        <defs>
          <clipPath id={`l${uid}`}><rect x={x0 - 5} y={y0 - 5} width={splitX - x0 + 5} height={H + 10} /></clipPath>
          <clipPath id={`r${uid}`}><rect x={splitX} y={y0 - 5} width={x0 + W - splitX + 5} height={H + 10} /></clipPath>
        </defs>
        <g clipPath={`url(#l${uid})`}>
          {bld.map((d, i) => <path key={i} d={d} fill={C.buildings} fillOpacity={0.28} />)}
          {cad.map((d, i) => <path key={i} d={d} fill={C.cadastral} fillOpacity={0.07} stroke={C.cadastral} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />)}
          {ori.map((d, i) => <path key={i} d={d} fill="none" stroke={C.ori} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />)}
        </g>
        <g clipPath={`url(#r${uid})`}>
          {bld.map((d, i) => <path key={i} d={d} fill={C.buildings} fillOpacity={0.22} />)}
          {harm.map((d, i) => {
            const p = ward.harm.features[i].properties;
            return <path key={i} d={d} fill={confidenceFill(p.confidence)} fillOpacity={0.6} stroke={p.status === "needs_review" ? C.flag : C.ok} strokeWidth={p.status === "needs_review" ? 1.8 : 1.1} vectorEffect="non-scaling-stroke" />;
          })}
        </g>
        <line x1={splitX} x2={splitX} y1={y0} y2={y0 + H} stroke={C.ink} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="hero-tag left">As received</div>
      <div className="hero-tag right">Harmonized</div>
      <div
        className="hero-handle" style={{ left: `${pct}%` }} role="slider" tabIndex={0}
        aria-label="Compare layers as received with the harmonized record" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); move(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons) move(e.clientX); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); touched.current = true; setPct((p) => Math.min(97, Math.max(3, p + (e.key === "ArrowLeft" ? -4 : 4)))); }
        }}
      ><span /></div>
      <ul className="hero-key">
        <li><i style={{ background: C.cadastral }} />Cadastral map</li>
        <li><i style={{ background: C.ori }} />Drone boundaries</li>
        <li><i style={{ background: C.ok }} />Confident parcel</li>
        <li><i style={{ background: C.flag }} />Needs a person</li>
      </ul>
    </div>
  );
}
