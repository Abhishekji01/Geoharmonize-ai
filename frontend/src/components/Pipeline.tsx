import { useEffect, useMemo, useRef, useState } from "react";
import type { WardData } from "../hooks";
import { MapView, type LayerSpec } from "./MapView";
import { C, confidenceFill } from "../theme";
import { RegisterCard } from "./RegisterCard";
import { TopologyVisualizerModal } from "./TopologyVisualizerModal";
import { GeoAiFeatureModal } from "./GeoAiFeatureModal";

type Legend = { color: string; label: string; hatch?: boolean }[];

function stageView(n: number, w: WardData): { layers: LayerSpec[]; legend: Legend; grid?: boolean; pick?: boolean } {
  const bld: LayerSpec = { id: "bld", data: w.bld, style: () => ({ fill: C.buildings, fillOpacity: 0.28 }) };
  const rawCad: LayerSpec = {
    id: "cad",
    data: w.cad,
    style: () => ({ fill: C.cadastral, fillOpacity: 0.08, stroke: C.cadastral, width: 1.3 }),
  };
  const rawOri: LayerSpec = { id: "ori", data: w.ori, style: () => ({ stroke: C.ori, width: 1.3 }) };
  const rawMun: LayerSpec = {
    id: "mun",
    data: w.mun,
    style: () => ({ stroke: C.municipal, width: 1.1, dash: "3 2" }),
  };

  switch (n) {
    case 1:
      return {
        layers: [bld, rawMun, rawCad, rawOri],
        legend: [
          { color: C.cadastral, label: "Cadastral Map (EPSG:4326)" },
          { color: C.ori, label: "Drone ORI Survey" },
          { color: C.municipal, label: "Municipal GIS (EPSG:3857)" },
          { color: C.buildings, label: "Building Footprints" },
        ],
      };
    case 2:
      return {
        layers: [bld, rawMun, rawCad, rawOri],
        grid: true,
        legend: [{ color: C.soft, label: "Unified UTM Zone 44N Metric Projection Grid (50m)" }],
      };
    case 3:
      return {
        layers: [
          bld,
          {
            id: "ori",
            data: w.ori,
            style: (f) => {
              const c = f.properties.detection_confidence as number;
              return c < 0.62
                ? { fill: "pat:red", stroke: C.flag, width: 1.8 }
                : { fill: C.ori, fillOpacity: 0.12 + (c - 0.62) * 0.7, stroke: C.ori, width: 1.2 };
            },
          },
        ],
        legend: [
          { color: C.ori, label: "Extracted Drone Boundary (High Confidence)" },
          { color: C.flag, label: "Low Detection Confidence / Occluded", hatch: true },
        ],
      };
    case 4:
      return {
        pick: true,
        layers: [
          {
            id: "h",
            data: w.harm,
            interactive: true,
            style: (f) => {
              const p = f.properties;
              const k = p.sources.length;
              if (!p.sources.includes("cadastral")) return { fill: "pat:red", stroke: C.flag, width: 1.6 };
              return {
                fill: C.municipal,
                fillOpacity: k >= 5 ? 0.65 : k === 4 ? 0.38 : 0.15,
                stroke: C.municipal,
                width: 0.9,
              };
            },
          },
        ],
        legend: [
          { color: C.municipal, label: "Multi-Source Concordance (Darker = 4+ Sources)" },
          { color: C.flag, label: "Single-Source Discrepancy", hatch: true },
        ],
      };
    case 5:
      return {
        pick: true,
        layers: [
          {
            id: "h",
            data: w.harm,
            interactive: true,
            style: (f) =>
              f.properties.n_edits > 1
                ? { fill: "pat:green", stroke: C.ok, width: 1.3 }
                : { fill: "#DCFCE7", stroke: C.ok, width: 0.9 },
          },
        ],
        legend: [
          { color: C.ok, label: "Topologically Repaired & Snapped", hatch: true },
          { color: "#DCFCE7", label: "Contiguous Verified Boundary" },
        ],
      };
    case 6:
      return {
        pick: true,
        layers: [
          {
            id: "h",
            data: w.harm,
            interactive: true,
            style: (f) => {
              const p = f.properties;
              if (p.open_conflicts) return { fill: "pat:red", stroke: C.flag, width: 1.6 };
              if (p.resolved_conflicts) return { fill: "pat:amber", stroke: C.ori, width: 1.2 };
              return { fill: "#F1F5F9", stroke: C.soft, width: 0.8 };
            },
          },
        ],
        legend: [
          { color: C.flag, label: "Action Required (Owner / Extent Conflict)", hatch: true },
          { color: C.ori, label: "Resolved by Automated Rule Engine", hatch: true },
          { color: C.soft, label: "Concordant / No Conflict" },
        ],
      };
    default:
      return {
        pick: true,
        layers: [
          {
            id: "h",
            data: w.harm,
            interactive: true,
            style: (f) => ({
              fill: confidenceFill(f.properties.confidence),
              stroke: "#FFFFFF",
              width: 0.9,
            }),
          },
          {
            id: "r",
            data: w.harm,
            style: (f) =>
              f.properties.status === "needs_review" ? { fill: "pat:red", stroke: C.flag, width: 2 } : {},
          },
        ],
        legend: [
          { color: confidenceFill(0.95), label: "High Confidence (Auto-Accepted ≥80%)" },
          { color: confidenceFill(0.55), label: "Moderate / Flagged Confidence" },
          { color: C.flag, label: "Routed to Human Review Queue", hatch: true },
        ],
      };
  }
}

export function Pipeline({ ward }: { ward: WardData }) {
  const [active, setActive] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [showTopoModal, setShowTopoModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.n));
        }),
      { rootMargin: "-35% 0px -50% 0px" }
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [ward]);

  const view = useMemo(() => stageView(active, ward), [active, ward]);
  useEffect(() => {
    if (!view.pick) setSelected(null);
  }, [view.pick]);

  return (
    <>
      <div className="pipeline-container">
        <div className="pipeline-steps-col">
          {ward.summary.stages.map((s, i) => (
            <article
              key={s.n}
              data-n={s.n}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className={`pipeline-card ${s.n === active ? "active-stage" : ""}`}
              onClick={() => setActive(s.n)}
            >
              <div className="card-stage-badge">
                <span className="stage-index">Stage 0{s.n}</span>
                <span className="stage-time">{s.ms} ms</span>
              </div>

              <h3 className="stage-title">{s.name}</h3>
              <p className="stage-summary">{s.summary}</p>

              {s.note && <div className="stage-callout">{s.note}</div>}

              {/* Special interactive triggers on specific stages */}
              {s.n === 3 && (
                <button className="btn-stage-action" onClick={(e) => { e.stopPropagation(); setShowAiModal(true); }}>
                  Inspect GeoAI Extraction Model →
                </button>
              )}
              {s.n === 5 && (
                <button className="btn-stage-action" onClick={(e) => { e.stopPropagation(); setShowTopoModal(true); }}>
                  Inspect Topology Snapping Engine →
                </button>
              )}

              <div className="stage-metrics-grid">
                {s.metrics.map((m) => (
                  <div key={m.label} className="metric-box">
                    <span className="metric-lbl">{m.label}</span>
                    <strong className="metric-val">
                      {m.value}
                      {m.note && <small className="metric-sub">{m.note}</small>}
                    </strong>
                  </div>
                ))}
              </div>

              <div className="stage-tech-tags">
                {s.tech.map((t) => (
                  <span key={t} className="tech-badge">
                    {t}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="pipeline-sticky-map">
          <div className="sticky-map-wrapper">
            <MapView
              bounds={ward.summary.bounds}
              layers={view.layers}
              grid={view.grid}
              origin={ward.summary.origin_utm}
              furniture
              selectedId={selected}
              onSelect={view.pick ? setSelected : undefined}
              label={`Ward map visualization at Stage ${active}`}
            />

            <div className="map-legend-bar">
              <div className="legend-items">
                {view.legend.map((item) => (
                  <div key={item.label} className="legend-chip">
                    <span
                      className="legend-color-box"
                      style={{
                        background: item.hatch ? `repeating-linear-gradient(135deg, ${item.color} 0 2px, transparent 2px 5px)` : item.color,
                      }}
                    />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {selected && (
              <div className="pipeline-selected-drawer">
                <RegisterCard runId={ward.summary.id} id={selected} onPick={setSelected} />
              </div>
            )}
          </div>
        </div>
      </div>

      {showTopoModal && <TopologyVisualizerModal onClose={() => setShowTopoModal(false)} />}
      {showAiModal && <GeoAiFeatureModal onClose={() => setShowAiModal(false)} />}
    </>
  );
}
