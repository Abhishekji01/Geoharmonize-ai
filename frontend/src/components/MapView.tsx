import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FC, Feature } from "../api";
import { geomBox, makeProj, pathsFor, type Bounds } from "../geo";

export type Style = { fill?: string; fillOpacity?: number; stroke?: string; width?: number; dash?: string; opacity?: number };
export type LayerSpec = { id: string; data: FC; style: (f: Feature) => Style; interactive?: boolean };

type View = { cx: number; cy: number; k: number }; // k = pixels per metre

export function MapView(props: {
  bounds: Bounds;
  layers: LayerSpec[];
  grid?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  focus?: { id: string; nonce: number } | null;
  label?: string;
  className?: string;
}) {
  const { bounds, layers, grid, selectedId, onSelect, focus, label } = props;
  const proj = useMemo(() => makeProj(bounds), [bounds]);
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ cx: 0, cy: 0, k: 1 });
  const fitted = useRef(false);
  const drag = useRef<{ x: number; y: number; moved: boolean; v: View } | null>(null);

  const fit = useCallback(() => {
    const k = Math.min(size.w / (proj.w * 1.1), size.h / (proj.h * 1.1));
    setView({ cx: 0, cy: 0, k });
  }, [size, proj]);

  useLayoutEffect(() => {
    const el = host.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => { fitted.current = false; }, [proj]);
  useEffect(() => { if (!fitted.current && size.w > 0) { fit(); fitted.current = true; } }, [fit, size]);

  // wheel zoom around the cursor (needs a non-passive listener)
  useEffect(() => {
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
  }, []);

  // focus a parcel
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

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false, v: view };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setView({ ...d.v, cx: d.v.cx - dx / d.v.k, cy: d.v.cy - dy / d.v.k });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-id]") as SVGElement | null;
    onSelect?.(hit ? hit.getAttribute("data-id") : null);
  };
  const zoom = (f: number) => setView((v) => ({ ...v, k: Math.min(40, Math.max(0.4, v.k * f)) }));

  const vw = size.w / view.k, vh = size.h / view.k;
  const gridLines = useMemo(() => {
    if (!grid) return null;
    const step = 50, lines: string[] = [];
    for (let x = Math.ceil(-proj.w / 2 / step) * step; x <= proj.w / 2 + step; x += step) lines.push(`M${x} ${-proj.h}V${proj.h}`);
    for (let y = Math.ceil(-proj.h / 2 / step) * step; y <= proj.h / 2 + step; y += step) lines.push(`M${-proj.w}  ${y}H${proj.w}`);
    return lines.join("");
  }, [grid, proj]);

  return (
    <div ref={host} className={`map ${props.className ?? ""}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} role="img" aria-label={label ?? "Map of parcels"}>
      <svg width={size.w} height={size.h} viewBox={`${view.cx - vw / 2} ${view.cy - vh / 2} ${vw} ${vh}`}>
        {gridLines && <path d={gridLines} className="map-grid" vectorEffect="non-scaling-stroke" />}
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
                    fill={s.fill ?? "none"} fillOpacity={s.fillOpacity ?? 1} opacity={s.opacity ?? 1}
                    stroke={sel ? "#0E1A2B" : s.stroke ?? "none"} strokeWidth={sel ? 2.4 : s.width ?? 1} strokeDasharray={s.dash}
                    className={l.interactive ? "pick" : undefined}
                    pointerEvents={l.interactive ? "auto" : "none"}
                    data-id={l.interactive ? id : undefined}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="map-ctl">
        <button onClick={() => zoom(1.5)} aria-label="Zoom in">+</button>
        <button onClick={() => zoom(1 / 1.5)} aria-label="Zoom out">−</button>
        <button onClick={fit} aria-label="Fit to ward" className="fit">Fit</button>
      </div>
    </div>
  );
}
