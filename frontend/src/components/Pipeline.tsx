import { useEffect, useMemo, useRef, useState } from "react";
import type { WardData } from "../hooks";
import { MapView, type LayerSpec } from "./MapView";
import { C, confidenceFill, hatchCss } from "../theme";
import { RegisterCard } from "./RegisterCard";

type Legend = { color: string; label: string; hatch?: boolean }[];

function stageView(n: number, w: WardData): { layers: LayerSpec[]; legend: Legend; grid?: boolean; pick?: boolean } {
  const bld: LayerSpec = { id: "bld", data: w.bld, style: () => ({ fill: C.buildings, fillOpacity: 0.28 }) };
  const rawCad: LayerSpec = { id: "cad", data: w.cad, style: () => ({ fill: C.cadastral, fillOpacity: 0.05, stroke: C.cadastral, width: 1.2 }) };
  const rawOri: LayerSpec = { id: "ori", data: w.ori, style: () => ({ stroke: C.ori, width: 1.2 }) };
  const rawMun: LayerSpec = { id: "mun", data: w.mun, style: () => ({ stroke: C.municipal, width: 1, dash: "3 2" }) };
  switch (n) {
    case 1: return { layers: [bld, rawMun, rawCad, rawOri], legend: [{ color: C.cadastral, label: "Cadastral" }, { color: C.ori, label: "Drone" }, { color: C.municipal, label: "Municipal" }, { color: C.buildings, label: "Buildings" }] };
    case 2: return { layers: [bld, rawMun, rawCad, rawOri], grid: true, legend: [{ color: C.soft, label: "50 m grid in one coordinate system" }] };
    case 3: return {
      layers: [bld, { id: "ori", data: w.ori, style: (f) => {
        const c = f.properties.detection_confidence as number;
        return c < 0.62 ? { fill: "pat:red", stroke: C.flag, width: 1.6 } : { fill: C.ori, fillOpacity: 0.08 + (c - 0.62) * 0.8, stroke: C.ori, width: 1 };
      } }],
      legend: [{ color: C.ori, label: "Detected boundary, darker is surer" }, { color: C.flag, label: "Low-confidence detection", hatch: true }],
    };
    case 4: return {
      pick: true,
      layers: [{ id: "h", data: w.harm, interactive: true, style: (f) => {
        const p = f.properties; const k = p.sources.length;
        if (!p.sources.includes("cadastral")) return { fill: "pat:red", stroke: C.flag, width: 1.5 };
        return { fill: C.municipal, fillOpacity: k >= 5 ? 0.62 : k === 4 ? 0.36 : 0.14, stroke: C.municipal, width: 0.8 };
      } }],
      legend: [{ color: C.municipal, label: "Linked to more sources is darker" }, { color: C.flag, label: "Found only in drone imagery", hatch: true }],
    };
    case 5: return {
      pick: true,
      layers: [{ id: "h", data: w.harm, interactive: true, style: (f) => f.properties.n_edits > 1
        ? { fill: "pat:green", stroke: C.ok, width: 1.1 } : { fill: "#EAF3EE", stroke: C.ok, width: 0.8 } }],
      legend: [{ color: C.ok, label: "Geometry repaired, snapped or trimmed", hatch: true }, { color: "#EAF3EE", label: "Left as it was" }],
    };
    case 6: return {
      pick: true,
      layers: [{ id: "h", data: w.harm, interactive: true, style: (f) => {
        const p = f.properties;
        if (p.open_conflicts) return { fill: "pat:red", stroke: C.flag, width: 1.5 };
        if (p.resolved_conflicts) return { fill: "pat:amber", stroke: C.ori, width: 1.1 };
        return { fill: "#F1F4F5", stroke: C.soft, width: 0.7 };
      } }],
      legend: [{ color: C.flag, label: "Open conflict, needs a person", hatch: true }, { color: C.ori, label: "Settled by rule", hatch: true }, { color: C.soft, label: "No conflict" }],
    };
    default: return {
      pick: true,
      layers: [
        { id: "h", data: w.harm, interactive: true, style: (f) => ({ fill: confidenceFill(f.properties.confidence), stroke: "#FFFFFF", width: 0.8 }) },
        { id: "r", data: w.harm, style: (f) => f.properties.status === "needs_review" ? { fill: "pat:red", stroke: C.flag, width: 1.8 } : {} },
      ],
      legend: [{ color: confidenceFill(0.98), label: "High confidence" }, { color: confidenceFill(0.5), label: "Low confidence" }, { color: C.flag, label: "Sent to human validation", hatch: true }],
    };
  }
}

export function Pipeline({ ward }: { ward: WardData }) {
  const [active, setActive] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
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
  useEffect(() => { if (!view.pick) setSelected(null); }, [view.pick]);

  return (
    <div className="pipeline">
      <div className="pipeline-steps">
        {ward.summary.stages.map((s, i) => (
          <article key={s.n} data-n={s.n} ref={(el) => { refs.current[i] = el; }} className={s.n === active ? "step on" : "step"}>
            <span className="step-n" aria-hidden>{s.n}</span>
            <h3><span className="sr">Stage {s.n}: </span>{s.name}</h3>
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
          <MapView bounds={ward.summary.bounds} layers={view.layers} grid={view.grid} origin={ward.summary.origin_utm} furniture selectedId={selected} onSelect={view.pick ? setSelected : undefined} label={`Ward map at stage ${active}`} />
          {view.pick && !selected && <p className="pipe-hint">Select a plot to see what each department recorded.</p>}
          {view.pick && selected && <RegisterCard runId={ward.summary.id} id={selected} className="pipe-card" />}
          <ul className="map-legend">{view.legend.map((l) => <li key={l.label}><i style={{ background: l.hatch ? hatchCss(l.color) : l.color, border: l.hatch ? `1px solid ${l.color}` : undefined }} />{l.label}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}
