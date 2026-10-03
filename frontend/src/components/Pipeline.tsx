import { useEffect, useMemo, useRef, useState } from "react";
import type { WardData } from "../hooks";
import { MapView, type LayerSpec } from "./MapView";
import { C, confidenceFill } from "../theme";

type Legend = { color: string; label: string }[];

function stageView(n: number, w: WardData): { layers: LayerSpec[]; legend: Legend; grid?: boolean } {
  const bld: LayerSpec = { id: "bld", data: w.bld, style: () => ({ fill: C.buildings, fillOpacity: 0.3 }) };
  const rawCad: LayerSpec = { id: "cad", data: w.cad, style: () => ({ fill: C.cadastral, fillOpacity: 0.06, stroke: C.cadastral, width: 1.2 }) };
  const rawOri: LayerSpec = { id: "ori", data: w.ori, style: () => ({ stroke: C.ori, width: 1.2 }) };
  const rawMun: LayerSpec = { id: "mun", data: w.mun, style: () => ({ stroke: C.municipal, width: 1, dash: "3 2" }) };
  switch (n) {
    case 1: return { layers: [bld, rawMun, rawCad, rawOri], legend: [{ color: C.cadastral, label: "Cadastral" }, { color: C.ori, label: "Drone ORI" }, { color: C.municipal, label: "Municipal" }, { color: C.buildings, label: "Buildings" }] };
    case 2: return { layers: [bld, rawMun, rawCad, rawOri], grid: true, legend: [{ color: C.line, label: "50 m grid, one coordinate system" }] };
    case 3: return {
      layers: [bld, { id: "ori", data: w.ori, style: (f) => {
        const c = f.properties.detection_confidence as number;
        return c < 0.62 ? { fill: C.flag, fillOpacity: 0.3, stroke: C.flag, width: 1.6 } : { fill: C.ori, fillOpacity: 0.1 + (c - 0.62) * 0.9, stroke: C.ori, width: 1 };
      } }],
      legend: [{ color: C.ori, label: "Detected boundary, darker is surer" }, { color: C.flag, label: "Low-confidence detection" }],
    };
    case 4: return {
      layers: [{ id: "h", data: w.harm, style: (f) => {
        const p = f.properties; const n = p.sources.length;
        if (!p.sources.includes("cadastral")) return { fill: C.flag, fillOpacity: 0.45, stroke: C.flag, width: 1.4 };
        return { fill: C.municipal, fillOpacity: n >= 5 ? 0.6 : n === 4 ? 0.35 : 0.14, stroke: C.municipal, width: 0.8 };
      } }],
      legend: [{ color: C.municipal, label: "Linked to more sources is darker" }, { color: C.flag, label: "Seen only in drone imagery" }],
    };
    case 5: return {
      layers: [{ id: "h", data: w.harm, style: (f) => ({ fill: C.ok, fillOpacity: f.properties.n_edits > 1 ? 0.5 : 0.16, stroke: C.ok, width: 1 }) }],
      legend: [{ color: C.ok, label: "Geometry repaired, snapped or trimmed is darker" }],
    };
    case 6: return {
      layers: [{ id: "h", data: w.harm, style: (f) => {
        const p = f.properties;
        if (p.open_conflicts) return { fill: C.flag, fillOpacity: 0.6, stroke: C.flag, width: 1.2 };
        if (p.resolved_conflicts) return { fill: C.ori, fillOpacity: 0.5, stroke: C.ori, width: 1 };
        return { fill: "#CBD5E1", fillOpacity: 0.4, stroke: "#94A3B8", width: 0.6 };
      } }],
      legend: [{ color: C.flag, label: "Open conflict, needs a person" }, { color: C.ori, label: "Conflict settled by rule" }, { color: "#CBD5E1", label: "No conflict" }],
    };
    default: return {
      layers: [{ id: "h", data: w.harm, style: (f) => {
        const p = f.properties;
        return { fill: confidenceFill(p.confidence), fillOpacity: 0.85, stroke: p.status === "needs_review" ? C.flag : "#FFFFFF", width: p.status === "needs_review" ? 2 : 0.8 };
      } }],
      legend: [{ color: confidenceFill(0.98), label: "High confidence" }, { color: confidenceFill(0.5), label: "Low confidence" }, { color: C.flag, label: "Outlined: sent to human validation" }],
    };
  }
}

export function Pipeline({ ward }: { ward: WardData }) {
  const [active, setActive] = useState(1);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.n)); }),
      { rootMargin: "-38% 0px -52% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [ward]);

  const view = useMemo(() => stageView(active, ward), [active, ward]);

  return (
    <div className="pipeline">
      <div className="pipeline-steps">
        {ward.summary.stages.map((s, i) => (
          <article key={s.n} data-n={s.n} ref={(el) => { refs.current[i] = el; }} className={s.n === active ? "step on" : "step"}>
            <h3><span className="step-n">{s.n}</span>{s.name}</h3>
            <p>{s.summary}</p>
            {s.note && <p className="step-note">{s.note}</p>}
            <dl className="metrics">
              {s.metrics.map((m) => (
                <div key={m.label}>
                  <dt>{m.label}</dt>
                  <dd>{m.value}{m.note && <small>{m.note}</small>}</dd>
                </div>
              ))}
            </dl>
            <p className="tech">{s.tech.join(", ")}</p>
          </article>
        ))}
      </div>
      <div className="pipeline-map">
        <div className="pipeline-map-inner">
          <MapView bounds={ward.summary.bounds} layers={view.layers} grid={view.grid} label={`Ward map at stage ${active}`} />
          <ul className="map-legend">{view.legend.map((l) => <li key={l.label}><i style={{ background: l.color }} />{l.label}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}
