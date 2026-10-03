import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FC, Feature } from "../api";
import { geomBox, makeProj, pathsFor, type Bounds } from "../geo";
import { C } from "../theme";

/** fill may be a colour, "none", or "pat:<name>" for a hatch that keeps its size on screen. */
export type Style = { fill?: string; fillOpacity?: number; stroke?: string; width?: number; dash?: string; opacity?: number };
export type LayerSpec = { id: string; data: FC; style: (f: Feature) => Style; interactive?: boolean };
type View = { cx: number; cy: number; k: number }; // k = pixels per metre
type Inset = { l: number; r: number; t: number; b: number };

const PATTERNS: Record<string, { color: string; kind: "hatch" | "dots" | "cross" }> = {
  red: { color: C.flag, kind: "hatch" }, amber: { color: C.ori, kind: "hatch" }, blue: { color: C.cadastral, kind: "hatch" },
  ink: { color: C.ink, kind: "hatch" }, green: { color: C.ok, kind: "dots" }, grey: { color: C.buildings, kind: "cross" },
};
const NICE = [5, 10, 20, 50, 100, 200, 500, 1000];
const nice = (minM: number) => NICE.find((n) => n >= minM) ?? 1000;
const grp = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export function MapView(props: {
  bounds: Bounds;
  layers: LayerSpec[];
  origin?: [number, number];     // UTM of the bounds centre; enables the sheet furniture
  furniture?: boolean;
  grid?: boolean;
  inset?: Partial<Inset>;
  isStatic?: boolean;            // no pan or zoom, still selectable
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  focus?: { id: string; nonce: number } | null;
  label?: string;
  className?: string;
}) {
  const { bounds, layers, grid, selectedId, onSelect, focus, label, isStatic, origin, furniture } = props;
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
  const margin = furniture ? 24 : 0;

  const fit = useCallback(() => {
    const aw = size.w - ins.l - ins.r - margin * 2, ah = size.h - ins.t - ins.b - margin * 2;
    const k = Math.min(aw / (proj.w * 1.06), ah / (proj.h * 1.06));
    const sx = ins.l + (size.w - ins.l - ins.r) / 2, sy = ins.t + (size.h - ins.t - ins.b) / 2;
    setView({ k, cx: -(sx - size.w / 2) / k, cy: -(sy - size.h / 2) / k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, proj, insKey, margin]);

  useLayoutEffect(() => {
    const el = host.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => { fitted.current = false; }, [proj, insKey]);
  useEffect(() => { if (size.w > 0) { if (!fitted.current || isStatic) { fit(); fitted.current = true; } } }, [fit, size, isStatic]);

  useEffect(() => {
    if (isStatic) return;
    const el = host.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
      setView((v) => {
        const k = Math.min(40, Math.max(0.4, v.k * Math.exp(-e.deltaY * 0.0015)));
        const wx = v.cx + mx / v.k, wy = v.cy + my / v.k;
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
        const k = Math.min(size.w / ((x1 - x0) * 5), size.h / ((y1 - y0) * 5), 14);
        setView({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k });
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (furniture && origin) { const [wx, wy] = toWorld(e.clientX, e.clientY); setCursor([origin[0] + wx, origin[1] - wy]); }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setView({ ...d.v, cx: d.v.cx - dx / d.v.k, cy: d.v.cy - dy / d.v.k });
  };
  const pick = (x: number, y: number) => {
    const hit = document.elementFromPoint(x, y)?.closest("[data-id]") as SVGElement | null;
    onSelect?.(hit ? hit.getAttribute("data-id") : null);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (isStatic || !d || d.moved) return;
    pick(e.clientX, e.clientY);
  };
  const zoom = (f: number) => setView((v) => ({ ...v, k: Math.min(40, Math.max(0.4, v.k * f)) }));

  const vw = size.w / view.k, vh = size.h / view.k;
  const gridPath = useMemo(() => {
    if (!grid) return null;
    const step = 50, out: string[] = [];
    for (let x = Math.ceil(-proj.w / 2 / step) * step; x <= proj.w / 2 + step; x += step) out.push(`M${x} ${-proj.h}V${proj.h}`);
    for (let y = Math.ceil(-proj.h / 2 / step) * step; y <= proj.h / 2 + step; y += step) out.push(`M${-proj.w} ${y}H${proj.w}`);
    return out.join("");
  }, [grid, proj]);

  const fill = (f?: string) => (f?.startsWith("pat:") ? `url(#${uid}-${f.slice(4)})` : f ?? "none");
  const ps = 5.5 / view.k; // pattern cell in world units = ~5.5 screen px

  return (
    <div
      ref={host} className={`map ${isStatic ? "static" : ""} ${props.className ?? ""}`} role="img" aria-label={label ?? "Map of parcels"}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setCursor(null)}
      onClick={isStatic ? (e) => pick(e.clientX, e.clientY) : undefined}
    >
      <svg width={size.w} height={size.h} viewBox={`${view.cx - vw / 2} ${view.cy - vh / 2} ${vw} ${vh}`}>
        <defs>
          {Object.entries(PATTERNS).map(([name, p]) => (
            <pattern key={name} id={`${uid}-${name}`} patternUnits="userSpaceOnUse" width={ps} height={ps} patternTransform={p.kind === "hatch" ? "rotate(45)" : undefined}>
              {p.kind === "hatch" && <line x1={0} y1={0} x2={0} y2={ps} stroke={p.color} strokeWidth={1.15 / view.k} />}
              {p.kind === "dots" && <circle cx={ps / 2} cy={ps / 2} r={0.85 / view.k} fill={p.color} />}
              {p.kind === "cross" && <path d={`M0 0L${ps} ${ps}M${ps} 0L0 ${ps}`} stroke={p.color} strokeWidth={0.8 / view.k} />}
            </pattern>
          ))}
        </defs>
        {gridPath && <path d={gridPath} className="map-grid" vectorEffect="non-scaling-stroke" />}
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
                    key={id + i} d={paths[i]} fillRule="evenodd" vectorEffect="non-scaling-stroke"
                    fill={fill(s.fill)} fillOpacity={s.fillOpacity ?? 1} opacity={s.opacity ?? 1}
                    stroke={sel ? C.ink : s.stroke ?? "none"} strokeWidth={sel ? 2.6 : s.width ?? 1} strokeDasharray={s.dash}
                    className={l.interactive ? "pick" : undefined} pointerEvents={l.interactive ? "auto" : "none"} data-id={l.interactive ? id : undefined}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      {furniture && origin && <Furniture view={view} size={size} origin={origin} cursor={cursor} />}
      {!isStatic && (
        <div className="map-ctl">
          <button onClick={() => zoom(1.5)} aria-label="Zoom in">+</button>
          <button onClick={() => zoom(1 / 1.5)} aria-label="Zoom out">−</button>
          <button onClick={fit} aria-label="Fit to ward" className="fit">Fit</button>
        </div>
      )}
    </div>
  );
}

/** The printed-sheet details: margin ticks in UTM metres, scale bar, north arrow, live coordinate. */
function Furniture({ view, size, origin, cursor }: { view: View; size: { w: number; h: number }; origin: [number, number]; cursor: [number, number] | null }) {
  const { k, cx, cy } = view;
  const m = 24;
  const step = nice(90 / k);
  const e0 = origin[0] + cx - size.w / 2 / k, e1 = origin[0] + cx + size.w / 2 / k;
  const n1 = origin[1] - (cy - size.h / 2 / k), n0 = origin[1] - (cy + size.h / 2 / k);
  const xs: number[] = [], ys: number[] = [];
  for (let e = Math.ceil(e0 / step) * step; e <= e1; e += step) xs.push(e);
  for (let n = Math.ceil(n0 / step) * step; n <= n1; n += step) ys.push(n);
  const sx = (e: number) => (e - origin[0] - cx) * k + size.w / 2;
  const sy = (n: number) => (origin[1] - n - cy) * k + size.h / 2;
  const bar = [10, 20, 50, 100, 200, 500].find((n) => n * k >= 70) ?? 500;
  return (
    <>
      <div className="fx" />
      <div className="fx-ticks" aria-hidden>
        {xs.filter((e) => sx(e) > m + 24 && sx(e) < size.w - m - 24).map((e) => <span key={e} className="tx" style={{ left: sx(e) }}>{grp(e)}</span>)}
        {ys.filter((n) => sy(n) > m + 24 && sy(n) < size.h - m - 24).map((n) => <span key={n} className="ty" style={{ top: sy(n) }}>{grp(n)}</span>)}
      </div>
      <div className="fx-scale" aria-hidden>
        <div className="bar" style={{ width: bar * k }}>{[0, 1, 2, 3].map((i) => <i key={i} style={{ background: i % 2 ? "#fff" : C.ink }} />)}</div>
        <span>0</span><span style={{ marginLeft: "auto" }}>{bar} m</span>
      </div>
      <svg className="fx-north" viewBox="0 0 24 34" aria-label="North is up"><path d="M12 2l7 22-7-5-7 5z" fill={C.ink} /><path d="M12 2v17l-7 5z" fill="#fff" stroke={C.ink} strokeWidth="1.2" /><text x="12" y="33" textAnchor="middle" fontSize="9" fontWeight="700" fill={C.ink}>N</text></svg>
      <div className="fx-coord" aria-hidden>{cursor ? <>E {grp(cursor[0])}&ensp;N {grp(cursor[1])}</> : "UTM 44N"}</div>
    </>
  );
}
