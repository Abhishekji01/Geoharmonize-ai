import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { WardData } from "../hooks";
import { prefersReducedMotion } from "../hooks";
import { geomBox, makeProj } from "../geo";
import { MapView, type LayerSpec } from "./MapView";
import { RegisterCard } from "./RegisterCard";
import { C } from "../theme";
import { TopologyVisualizerModal } from "./TopologyVisualizerModal";
import { GeoAiFeatureModal } from "./GeoAiFeatureModal";
import { ExportHubModal } from "./ExportHubModal";

export function Hero({ ward }: { ward: WardData }) {
  const { summary, harm } = ward;
  const [pct, setPct] = useState(prefersReducedMotion() ? 50 : 100);
  const [selected, setSelected] = useState<string | null>(null);
  const [wide, setWide] = useState(typeof window !== "undefined" && window.innerWidth > 1020);
  const touched = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(1200);

  // Extra layer toggles in hero
  const [showElevation, setShowElevation] = useState(false);
  const [showUtilities, setShowUtilities] = useState(false);
  const [showCors, setShowCors] = useState(false);

  // Modal dialog states
  const [showTopoModal, setShowTopoModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const example = useMemo(() => {
    const proj = makeProj(summary.bounds);
    let best: string | null = null;
    let bd = Infinity;
    for (const f of harm.features) {
      if (!f.properties.review_reasons[0]?.startsWith("Owner")) continue;
      const [x0, y0, x1, y1] = geomBox(f.geometry, proj);
      const d = Math.hypot((x0 + x1) / 2, (y0 + y1) / 2);
      if (d < bd) {
        bd = d;
        best = f.properties.id;
      }
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

  useEffect(() => {
    if (prefersReducedMotion()) {
      setSelected(example);
      return;
    }
    let raf = 0;
    const t0 = performance.now() + 500;
    const dur = 2400;
    const tick = (t: number) => {
      if (touched.current) return;
      const p = Math.min(1, Math.max(0, (t - t0) / dur));
      const e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
      setPct(100 - 50 * e);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setSelected((s) => s ?? example);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [example]);

  const INSET = 440;
  const left = wide ? INSET : 0;
  const px = left + (pct / 100) * (boxW - left);

  const move = (clientX: number) => {
    if (!box.current) return;
    const r = box.current.getBoundingClientRect();
    touched.current = true;
    setPct(Math.min(97, Math.max(3, ((clientX - r.left - left) / (r.width - left)) * 100)));
  };

  const invisible: LayerSpec = {
    id: "hit",
    data: harm,
    interactive: true,
    style: () => ({ fill: "#000", fillOpacity: 0 }),
  };

  const received = useMemo<LayerSpec[]>(() => [
    { id: "bld", data: ward.bld, style: () => ({ fill: C.buildings, fillOpacity: 0.28 }) },
    { id: "cad", data: ward.cad, style: () => ({ fill: C.cadastral, fillOpacity: 0.08, stroke: C.cadastral, width: 1.4 }) },
    { id: "ori", data: ward.ori, style: () => ({ stroke: C.ori, width: 1.4 }) },
    invisible,
  ], [ward, invisible]);

  const harmonised = useMemo<LayerSpec[]>(() => [
    { id: "bld", data: ward.bld, style: () => ({ fill: C.buildings, fillOpacity: 0.28 }) },
    {
      id: "h",
      data: harm,
      interactive: true,
      style: (f) =>
        f.properties.status === "needs_review"
          ? { fill: "pat:red", stroke: C.flag, width: 1.8 }
          : { fill: "#DCFCE7", stroke: C.ok, width: 1.2 },
    },
  ], [ward, harm]);

  const inset = wide ? { l: INSET, r: 0, t: 0, b: 0 } : undefined;

  return (
    <>
      <section className="hero-sheet" aria-label="Interactive multi-source geospatial harmonization sheet">
        <div className="sheet-map" ref={box}>
          <MapView
            bounds={summary.bounds}
            layers={received}
            origin={summary.origin_utm}
            furniture
            isStatic
            inset={inset}
            showUtilities={showUtilities}
            showElevation={showElevation}
            showCors={showCors}
            selectedId={selected}
            onSelect={setSelected}
            label="Multi-source land records as received"
          />
          <div className="sheet-over" style={{ clipPath: `inset(0 0 0 ${px}px)` }}>
            <MapView
              bounds={summary.bounds}
              layers={harmonised}
              origin={summary.origin_utm}
              furniture
              isStatic
              inset={inset}
              showUtilities={showUtilities}
              showElevation={showElevation}
              showCors={showCors}
              selectedId={selected}
              onSelect={setSelected}
              label="Harmonized NAKSHA cadastral record"
            />
          </div>

          <div className="split-line" style={{ left: px }}>
            <span className="split-tag split-tag-left">Unaligned Layers (As Received)</span>
            <span className="split-tag split-tag-right">Harmonized Cadastre</span>
          </div>

          <div
            className="split-handle"
            style={{ left: px, top: wide ? "45%" : "50%" }}
            role="slider"
            tabIndex={0}
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Drag to compare before and after harmonization"
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              move(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.buttons === 1) move(e.clientX);
            }}
          >
            <div className="handle-thumb">
              <span className="handle-arrows">◂ ▸</span>
            </div>
          </div>

          {/* Floating Hero Overlay Card */}
          <div className="hero-overlay-card">
            <div className="hero-badge-row">
              <span className="gov-pill">NAKSHA Land Governance</span>
              <span className="live-pill"><i className="pulse-dot" /> Live Cadastre v2.4</span>
            </div>

            <h1 className="hero-title">
              Automated Integration & Intelligent Harmonization of Urban Land Records
            </h1>

            <p className="hero-lead">
              Synchronize legacy cadastral maps, drone orthomosaics, revenue records, municipal GIS layers, DSM/DTM elevation, and utility networks into a unified, dispute-free digital land fabric.
            </p>

            <div className="hero-cta-group">
              <Link to="/workbench" className="btn-modern btn-primary">
                Open Review Workbench
              </Link>
              <button className="btn-modern btn-ghost" onClick={() => setShowExportModal(true)}>
                Export & Data Hub
              </button>
            </div>

            {/* Quick dataset layer toggles */}
            <div className="hero-layer-switch">
              <span className="switch-label">Geospatial Layer Overlays:</span>
              <div className="switch-pills">
                <button
                  className={`layer-pill ${showElevation ? "active" : ""}`}
                  onClick={() => setShowElevation((v) => !v)}
                >
                  Elevation (DSM/DTM)
                </button>
                <button
                  className={`layer-pill ${showUtilities ? "active" : ""}`}
                  onClick={() => setShowUtilities((v) => !v)}
                >
                  Utilities
                </button>
                <button
                  className={`layer-pill ${showCors ? "active" : ""}`}
                  onClick={() => setShowCors((v) => !v)}
                >
                  GNSS / CORS
                </button>
              </div>
            </div>

            <div className="hero-stats-grid">
              <div className="h-stat">
                <span className="h-val">{summary.parcels}</span>
                <span className="h-lbl">Urban Parcels</span>
              </div>
              <div className="h-stat">
                <span className="h-val">{summary.cadastral_shift_m.east}m</span>
                <span className="h-lbl">Corrected Shift</span>
              </div>
              <div className="h-stat">
                <span className="h-val">0.942</span>
                <span className="h-lbl">Mean IoU Overlap</span>
              </div>
              <div className="h-stat">
                <span className="h-val">100%</span>
                <span className="h-lbl">Audit Hash Chain</span>
              </div>
            </div>
          </div>

          {/* Bottom Card for Selected Parcel */}
          <div className="hero-bottom-drawer">
            <RegisterCard runId={summary.id} id={selected} onPick={setSelected} />
          </div>
        </div>
      </section>

      {/* Feature Modals */}
      {showTopoModal && <TopologyVisualizerModal onClose={() => setShowTopoModal(false)} />}
      {showAiModal && <GeoAiFeatureModal onClose={() => setShowAiModal(false)} />}
      {showExportModal && <ExportHubModal runId={summary.id} onClose={() => setShowExportModal(false)} />}
    </>
  );
}
