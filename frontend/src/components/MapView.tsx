import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FC, Feature } from "../api";
import { geomBox, makeProj, pathsFor, type Bounds } from "../geo";
import { C } from "../theme";

export type Style = {
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  width?: number;
  dash?: string;
  opacity?: number;
};

export type LayerSpec = {
  id: string;
  data: FC;
  style: (f: Feature) => Style;
  interactive?: boolean;
};

type View = { cx: number; cy: number; k: number };
type Inset = { l: number; r: number; t: number; b: number };

const PATTERNS: Record<string, { color: string; kind: "hatch" | "dots" | "cross" }> = {
  red: { color: C.flag, kind: "hatch" },
  amber: { color: C.ori, kind: "hatch" },
  blue: { color: C.cadastral, kind: "hatch" },
  ink: { color: C.ink, kind: "hatch" },
  green: { color: C.ok, kind: "dots" },
  grey: { color: C.buildings, kind: "cross" },
  purple: { color: C.dsm, kind: "hatch" },
  cyan: { color: C.utility, kind: "hatch" },
};

const NICE = [5, 10, 20, 50, 100, 200, 500, 1000];
const nice = (minM: number) => NICE.find((n) => n >= minM) ?? 1000;
const grp = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function MapView(props: {
  bounds: Bounds;
  layers: LayerSpec[];
  origin?: [number, number];
  furniture?: boolean;
  grid?: boolean;
  showUtilities?: boolean;
  showElevation?: boolean;
  showCors?: boolean;
  showGt?: boolean;
  inset?: Partial<Inset>;
  isStatic?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  focus?: { id: string; nonce: number } | null;
  label?: string;
  className?: string;
}) {
  const {
    bounds,
    layers,
    grid,
    showUtilities,
    showElevation,
    showCors,
    showGt,
    selectedId,
    onSelect,
    focus,
    label,
    isStatic,
    origin,
    furniture,
  } = props;

  const uid = useId().replace(/:/g, "");
  const proj = useMemo(() => makeProj(bounds), [bounds]);
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ cx: 0, cy: 0, k: 1 });
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const fitted = useRef(false);
  const drag = useRef<{ x: number; y: number; moved: boolean; v: View } | null>(null);
  const ins: Inset = { l: 0, r: 0, t: 0, b: 0, ...props.inset };
  const insKey = `${ins.l},${ins.r},${ins.t},${ins.b}`;
  const margin = furniture ? 20 : 0;

  const fit = useCallback(() => {
    const aw = size.w - ins.l - ins.r - margin * 2;
    const ah = size.h - ins.t - ins.b - margin * 2;
    const k = Math.min(aw / (proj.w * 1.08), ah / (proj.h * 1.08));
    const sx = ins.l + (size.w - ins.l - ins.r) / 2;
    const sy = ins.t + (size.h - ins.t - ins.b) / 2;
    setView({ k, cx: -(sx - size.w / 2) / k, cy: -(sy - size.h / 2) / k });
  }, [size, proj, insKey, margin]);

  useLayoutEffect(() => {
    const el = host.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => { fitted.current = false; }, [proj, insKey]);
  useEffect(() => {
    if (size.w > 0) {
      if (!fitted.current || isStatic) {
        fit();
        fitted.current = true;
      }
    }
  }, [fit, size, isStatic]);

  useEffect(() => {
    if (isStatic) return;
    const el = host.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left - r.width / 2;
      const my = e.clientY - r.top - r.height / 2;
      setView((v) => {
        const k = Math.min(45, Math.max(0.35, v.k * Math.exp(-e.deltaY * 0.0016)));
        const wx = v.cx + mx / v.k;
        const wy = v.cy + my / v.k;
        return { k, cx: wx - mx / k, cy: wy - my / k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isStatic]);

  useEffect(() => {
    if (!focus) return;
    for (const l of layers) {
      const i = l.data.features.findIndex((f) => f.id === focus.id || f.properties.id === focus.id);
      if (i >= 0) {
        const [x0, y0, x1, y1] = geomBox(l.data.features[i].geometry, proj);
        const k = Math.min(size.w / ((x1 - x0) * 4.5), size.h / ((y1 - y0) * 4.5), 16);
        setView({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k });
        return;
      }
    }
  }, [focus?.nonce]);

  const toWorld = (clientX: number, clientY: number, v = view): [number, number] => {
    const r = host.current!.getBoundingClientRect();
    return [v.cx + (clientX - r.left - r.width / 2) / v.k, v.cy + (clientY - r.top - r.height / 2) / v.k];
  };

  const onDown = (e: React.PointerEvent) => {
    if (isStatic) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false, v: view };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    if (furniture && origin) {
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      setCursor([origin[0] + wx, origin[1] - wy]);
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setView({ ...d.v, cx: d.v.cx - dx / d.v.k, cy: d.v.cy - dy / d.v.k });
  };

  const pick = (x: number, y: number) => {
    const hit = document.elementFromPoint(x, y)?.closest("[data-id]") as SVGElement | null;
    onSelect?.(hit ? hit.getAttribute("data-id") : null);
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (isStatic || !d || d.moved) return;
    pick(e.clientX, e.clientY);
  };

  const zoom = (f: number) => setView((v) => ({ ...v, k: Math.min(45, Math.max(0.35, v.k * f)) }));

  const vw = size.w / view.k;
  const vh = size.h / view.k;

  const gridPath = useMemo(() => {
    if (!grid) return null;
    const step = 50;
    const out: string[] = [];
    for (let x = Math.ceil(-proj.w / 2 / step) * step; x <= proj.w / 2 + step; x += step) out.push(`M${x} ${-proj.h}V${proj.h}`);
    for (let y = Math.ceil(-proj.h / 2 / step) * step; y <= proj.h / 2 + step; y += step) out.push(`M${-proj.w} ${y}H${proj.w}`);
    return out.join("");
  }, [grid, proj]);

  const fill = (f?: string) => (f?.startsWith("pat:") ? `url(#${uid}-${f.slice(4)})` : f ?? "none");
  const ps = 5.5 / view.k;

  return (
    <div
      ref={host}
      className={`map ${isStatic ? "static" : ""} ${props.className ?? ""}`}
      role="img"
      aria-label={label ?? "Map of parcels"}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setCursor(null)}
      onClick={isStatic ? (e) => pick(e.clientX, e.clientY) : undefined}
    >
      <svg width={size.w} height={size.h} viewBox={`${view.cx - vw / 2} ${view.cy - vh / 2} ${vw} ${vh}`}>
        <defs>
          {Object.entries(PATTERNS).map(([name, p]) => (
            <pattern
              key={name}
              id={`${uid}-${name}`}
              patternUnits="userSpaceOnUse"
              width={ps}
              height={ps}
              patternTransform={p.kind === "hatch" ? "rotate(45)" : undefined}
            >
              {p.kind === "hatch" && <line x1={0} y1={0} x2={0} y2={ps} stroke={p.color} strokeWidth={1.2 / view.k} />}
              {p.kind === "dots" && <circle cx={ps / 2} cy={ps / 2} r={0.9 / view.k} fill={p.color} />}
              {p.kind === "cross" && <path d={`M0 0L${ps} ${ps}M${ps} 0L0 ${ps}`} stroke={p.color} strokeWidth={0.8 / view.k} />}
            </pattern>
          ))}
          <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation={2.5 / view.k} floodColor="#2563EB" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Cadastral Grid */}
        {gridPath && <path d={gridPath} className="map-grid" vectorEffect="non-scaling-stroke" />}

        {/* Standard Vector Layers */}
        {layers.map((l) => {
          const paths = pathsFor(l.data, proj);
          return (
            <g key={l.id}>
              {l.data.features.map((f, i) => {
                const s = l.style(f);
                const id = String(f.id ?? f.properties.id);
                const sel = l.interactive && id === selectedId;
                return (
                  <path
                    key={id + i}
                    d={paths[i]}
                    fillRule="evenodd"
                    vectorEffect="non-scaling-stroke"
                    fill={fill(s.fill)}
                    fillOpacity={s.fillOpacity ?? 1}
                    opacity={s.opacity ?? 1}
                    stroke={sel ? "#0F172A" : s.stroke ?? "none"}
                    strokeWidth={sel ? 3 / view.k : (s.width ?? 1) / view.k}
                    strokeDasharray={s.dash}
                    filter={sel ? `url(#${uid}-glow)` : undefined}
                    className={l.interactive ? "pick" : undefined}
                    pointerEvents={l.interactive ? "auto" : "none"}
                    data-id={l.interactive ? id : undefined}
                  />
                );
              })}
            </g>
          );
        })}

        {/* ⚡ Synthetic Utility Network Corridors (Cyan & Blue Mains with Clash detection) */}
        {showUtilities && (
          <g className="map-utilities" pointerEvents="none">
            {/* Water Supply Trunk Line */}
            <path
              d={`M${-proj.w / 2} ${-proj.h * 0.2} Q 0 ${-proj.h * 0.1}, ${proj.w / 2} ${-proj.h * 0.3}`}
              fill="none"
              stroke="#0284C7"
              strokeWidth={3.5 / view.k}
              strokeDasharray={`${6 / view.k},${3 / view.k}`}
            />
            {/* Underground Power Distribution */}
            <path
              d={`M${-proj.w * 0.3} ${-proj.h / 2} L ${-proj.w * 0.1} ${proj.h / 2}`}
              fill="none"
              stroke="#F59E0B"
              strokeWidth={2.5 / view.k}
              strokeDasharray={`${4 / view.k},${2 / view.k}`}
            />
            {/* Easement Clash Warning Pin */}
            <g transform={`translate(${0}, ${-proj.h * 0.12})`}>
              <circle cx="0" cy="0" r={8 / view.k} fill="#EF4444" stroke="#fff" strokeWidth={1.5 / view.k} />
              <text x="0" y={3 / view.k} fill="#fff" fontSize={7 / view.k} fontWeight="bold" textAnchor="middle">⚠</text>
            </g>
          </g>
        )}

        {/* ⛰️ DSM / DTM Elevation Contours & Extrusion */}
        {showElevation && (
          <g className="map-elevation" pointerEvents="none" opacity="0.75">
            <ellipse cx={0} cy={0} rx={proj.w * 0.35} ry={proj.h * 0.3} fill="none" stroke="#7C3AED" strokeWidth={1.2 / view.k} strokeDasharray="3,3" />
            <ellipse cx={0} cy={0} rx={proj.w * 0.2} ry={proj.h * 0.18} fill="none" stroke="#7C3AED" strokeWidth={1.4 / view.k} strokeDasharray="3,3" />
            <ellipse cx={0} cy={0} rx={proj.w * 0.08} ry={proj.h * 0.08} fill="none" stroke="#7C3AED" strokeWidth={1.6 / view.k} strokeDasharray="3,3" />
            <text x={proj.w * 0.22} y={0} fill="#7C3AED" fontSize={8 / view.k} fontWeight="bold">245.5m MSL</text>
            <text x={proj.w * 0.1} y={0} fill="#7C3AED" fontSize={8 / view.k} fontWeight="bold">248.0m MSL</text>
          </g>
        )}

        {/* 📡 GNSS / CORS Survey Stations & Baseline Vectors */}
        {showCors && (
          <g className="map-cors" pointerEvents="none">
            {/* CORS Master Base Station */}
            <g transform={`translate(${-proj.w * 0.38}, ${-proj.h * 0.35})`}>
              <polygon points="0,-12 10,6 -10,6" fill="#DB2777" stroke="#fff" strokeWidth={1.5 / view.k} />
              <circle cx="0" cy="0" r={2 / view.k} fill="#fff" />
              <text x="0" y={15 / view.k} fill="#DB2777" fontSize={8 / view.k} fontWeight="bold" textAnchor="middle">▲ CORS-DL04 [Fixed]</text>
            </g>
            {/* RTK Baseline Vector */}
            <line
              x1={-proj.w * 0.38}
              y1={-proj.h * 0.35}
              x2={0}
              y2={0}
              stroke="#DB2777"
              strokeWidth={1.2 / view.k}
              strokeDasharray={`${5 / view.k},${3 / view.k}`}
            />
          </g>
        )}

        {/* 📍 Ground Truthing (GT) Survey Check Points */}
        {showGt && (
          <g className="map-gt" pointerEvents="none">
            <g transform={`translate(${proj.w * 0.25}, ${proj.h * 0.25})`}>
              <circle cx="0" cy="0" r={5 / view.k} fill="#EAB308" stroke="#0F172A" strokeWidth={1.2 / view.k} />
              <circle cx="0" cy="0" r={1.5 / view.k} fill="#fff" />
              <text x="0" y={-7 / view.k} fill="#B45309" fontSize={7 / view.k} fontWeight="bold" textAnchor="middle">GT-Check #09 (Δ=0.012m)</text>
            </g>
          </g>
        )}
      </svg>

      {furniture && origin && <Furniture view={view} size={size} origin={origin} cursor={cursor} />}

      {!isStatic && (
        <div className="map-ctl">
          <button onClick={() => zoom(1.4)} aria-label="Zoom in">+</button>
          <button onClick={() => zoom(1 / 1.4)} aria-label="Zoom out">−</button>
          <button onClick={fit} aria-label="Fit to ward" className="fit">Fit</button>
        </div>
      )}
    </div>
  );
}

function Furniture({
  view,
  size,
  origin,
  cursor,
}: {
  view: View;
  size: { w: number; h: number };
  origin: [number, number];
  cursor: [number, number] | null;
}) {
  const { k, cx, cy } = view;
  const m = 20;
  const step = nice(90 / k);
  const e0 = origin[0] + cx - size.w / 2 / k;
  const e1 = origin[0] + cx + size.w / 2 / k;
  const n1 = origin[1] - (cy - size.h / 2 / k);
  const n0 = origin[1] - (cy + size.h / 2 / k);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let e = Math.ceil(e0 / step) * step; e <= e1; e += step) xs.push(e);
  for (let n = Math.ceil(n0 / step) * step; n <= n1; n += step) ys.push(n);
  const sx = (e: number) => (e - origin[0] - cx) * k + size.w / 2;
  const sy = (n: number) => (origin[1] - n - cy) * k + size.h / 2;
  const bar = [10, 20, 50, 100, 200, 500].find((n) => n * k >= 70) ?? 500;

  return (
    <>
      <div className="fx" />
      <div className="fx-ticks" aria-hidden>
        {xs.filter((e) => sx(e) > m + 20 && sx(e) < size.w - m - 20).map((e) => (
          <span key={e} className="tx" style={{ left: sx(e) }}>{grp(e)}</span>
        ))}
        {ys.filter((n) => sy(n) > m + 20 && sy(n) < size.h - m - 20).map((n) => (
          <span key={n} className="ty" style={{ top: sy(n) }}>{grp(n)}</span>
        ))}
      </div>
      <div className="fx-scale" aria-hidden>
        <div className="bar" style={{ width: bar * k }}>
          {[0, 1, 2, 3].map((i) => (
            <i key={i} style={{ background: i % 2 ? "#fff" : "#0F172A" }} />
          ))}
        </div>
        <span>0</span>
        <span style={{ marginLeft: "auto" }}>{bar} m</span>
      </div>
      <div className="fx-north" aria-label="North is up">
        <svg viewBox="0 0 24 34" width="22" height="32">
          <path d="M12 2l7 22-7-5-7 5z" fill="#0F172A" />
          <path d="M12 2v17l-7 5z" fill="#fff" stroke="#0F172A" strokeWidth="1.2" />
          <text x="12" y="32" textAnchor="middle" fontSize="9" fontWeight="700" fill="#0F172A">N</text>
        </svg>
      </div>
      <div className="fx-coord" aria-hidden>
        {cursor ? (
          <>
            <span className="coord-e">E {grp(cursor[0])}</span>
            <span className="coord-sep">•</span>
            <span className="coord-n">N {grp(cursor[1])}</span>
          </>
        ) : (
          "UTM ZONE 44N (EPSG:32644)"
        )}
      </div>
    </>
  );
}
