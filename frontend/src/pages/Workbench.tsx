import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Audit, type FC, type ParcelDetail, type ParcelProps, type RunSummary } from "../api";
import { useWard } from "../hooks";
import { MapView, type LayerSpec } from "../components/MapView";
import { C, SOURCE_LABEL, confidenceFill } from "../theme";
import { Logo } from "./Home";
import { NakshaPassbookModal } from "../components/NakshaPassbookModal";
import { TopologyVisualizerModal } from "../components/TopologyVisualizerModal";
import { GeoAiFeatureModal } from "../components/GeoAiFeatureModal";
import { ExportHubModal } from "../components/ExportHubModal";

type Queue = (ParcelProps & { decision: string | null })[];
const COMP_LABEL: Record<string, string> = {
  geometry: "Boundary IoU",
  attributes: "Attribute Concordance",
  extraction: "Drone AI Confidence",
  coverage: "Multi-Source Coverage",
};

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) &&
  (t as HTMLInputElement).type !== "radio" &&
  (t as HTMLInputElement).type !== "checkbox";

export default function Workbench() {
  const [size, setSize] = useState("medium");
  const [seed, setSeed] = useState(7);
  const [seedText, setSeedText] = useState("7");
  const { data } = useWard(size, seed);

  const [harm, setHarm] = useState<FC<ParcelProps> | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [queue, setQueue] = useState<Queue>([]);
  const queueRef = useRef<Queue>([]);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [tab, setTab] = useState<"queue" | "parcel" | "audit">("queue");
  const [mode, setMode] = useState<"status" | "confidence">("status");

  // Layer Toggles
  const [show, setShow] = useState({
    bld: true,
    cad: false,
    ori: false,
    mun: false,
    dsm: false,
    utility: false,
    cors: false,
    gt: false,
  });

  // Modal dialog states
  const [showPassbook, setShowPassbook] = useState(false);
  const [selectedParcelDetail, setSelectedParcelDetail] = useState<ParcelDetail | null>(null);
  const [showTopoModal, setShowTopoModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const runId = data?.summary.id;
  const setQ = (q: Queue) => {
    queueRef.current = q;
    setQueue(q);
  };

  const refresh = useCallback(async () => {
    if (!runId) return;
    const [h, s, q, a] = await Promise.all([
      api.harmonised(runId),
      api.summary(runId),
      api.queue(runId),
      api.audit(),
    ]);
    setHarm(h);
    setSummary(s);
    setQ(q);
    setAudit(a);
  }, [runId]);

  useEffect(() => {
    if (!data) return;
    setHarm(data.harm);
    setSummary(data.summary);
    setSelected(null);
    setTab("queue");
    api.queue(data.summary.id).then(setQ);
    api.audit().then(setAudit);
  }, [data]);

  const pick = (id: string | null, zoom = false) => {
    setSelected(id);
    if (id) {
      setTab("parcel");
      if (zoom) setFocus({ id, nonce: Date.now() });
      if (runId) api.parcel(runId, id).then(setSelectedParcelDetail).catch(() => {});
    }
  };

  const step = useCallback(
    (dir: 1 | -1) => {
      const open = queueRef.current.filter((q) => !q.decision);
      if (!open.length) return;
      const i = open.findIndex((q) => q.id === selected);
      const next = open[(i + dir + open.length) % open.length] ?? open[0];
      pick(next.id, true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, runId]
  );

  const advance = useCallback(() => {
    const first = queueRef.current.find((q) => !q.decision);
    if (first) pick(first.id, true);
    else setTab("queue");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j") {
        e.preventDefault();
        step(1);
      }
      if (e.key === "k") {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const layers = useMemo<LayerSpec[]>(() => {
    if (!data || !harm) return [];
    const out: LayerSpec[] = [];
    if (show.bld) out.push({ id: "bld", data: data.bld, style: () => ({ fill: C.buildings, fillOpacity: 0.28 }) });
    if (show.mun) out.push({ id: "mun", data: data.mun, style: () => ({ stroke: C.municipal, width: 1.2, dash: "3 2" }) });
    if (show.cad) out.push({ id: "cad", data: data.cad, style: () => ({ stroke: C.cadastral, width: 1.4 }) });
    if (show.ori) out.push({ id: "ori", data: data.ori, style: () => ({ stroke: C.ori, width: 1.4 }) });
    out.push({
      id: "harm",
      data: harm,
      interactive: true,
      style: (f) => {
        const p = f.properties as ParcelProps;
        if (mode === "confidence")
          return {
            fill: confidenceFill(p.confidence),
            fillOpacity: show.cad || show.ori || show.mun ? 0.75 : 1,
            stroke: p.status === "needs_review" ? C.flag : "#fff",
            width: p.status === "needs_review" ? 2.2 : 0.8,
          };
        if (p.status === "needs_review") return { fill: "pat:red", stroke: C.flag, width: 1.8 };
        if (p.status === "validated") return { fill: C.ok, fillOpacity: 0.85, stroke: C.ok, width: 1.4 };
        if (p.status === "rejected") return { fill: "pat:ink", stroke: C.ink, width: 1.4, dash: "4 3" };
        return { fill: "#DCFCE7", fillOpacity: show.cad || show.ori || show.mun ? 0.6 : 1, stroke: C.ok, width: 1 };
      },
    });
    return out;
  }, [data, harm, show, mode]);

  const counts = summary?.status_counts ?? {};
  const openCount = queue.filter((q) => !q.decision).length;

  return (
    <div className="workbench-shell">
      {/* Top Header */}
      <header className="wb-topbar">
        <div className="wb-left-cluster">
          <Link to="/" className="nav-brand" aria-label="Back to home">
            <Logo size={24} />
            <div className="brand-text">
              <strong>GeoHarmonize AI</strong>
              <span className="brand-sub">Workbench</span>
            </div>
          </Link>
          <div className="wb-breadcrumbs">
            <span className="crumb-ward">Ward Run: <b>{runId ?? "Loading…"}</b></span>
            <span className="crumb-crs">CRS: <b>EPSG:32644 (UTM Zone 44N)</b></span>
          </div>
        </div>

        <div className="wb-controls-cluster">
          <div className="wb-param-pill">
            <label>Ward Size:</label>
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="small">Small (18 parcels)</option>
              <option value="medium">Medium (45 parcels)</option>
              <option value="large">Large (90 parcels)</option>
            </select>
          </div>

          <div className="wb-param-pill">
            <label>Seed:</label>
            <input
              type="text"
              value={seedText}
              className="seed-input"
              onChange={(e) => setSeedText(e.target.value)}
              onBlur={() => {
                const n = parseInt(seedText, 10);
                if (!isNaN(n) && n >= 0) setSeed(n);
                else setSeedText(String(seed));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </div>

          <button className="btn-wb-tool" onClick={() => setShowExportModal(true)}>
            Export & Data Hub
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="wb-main-layout">
        {/* Left Map Viewport */}
        <div className="wb-map-column">
          {/* Map Toolbar / Switchboard */}
          <div className="wb-map-toolbar">
            <div className="mode-toggle-group">
              <button
                className={`btn-mode ${mode === "status" ? "active" : ""}`}
                onClick={() => setMode("status")}
              >
                Harmonization Status
              </button>
              <button
                className={`btn-mode ${mode === "confidence" ? "active" : ""}`}
                onClick={() => setMode("confidence")}
              >
                Confidence Heatmap
              </button>
            </div>

            <div className="layer-switchboard">
              <label className={`switch-tag ${show.cad ? "on" : ""}`}>
                <input type="checkbox" checked={show.cad} onChange={(e) => setShow({ ...show, cad: e.target.checked })} />
                <span>Cadastral</span>
              </label>
              <label className={`switch-tag ${show.ori ? "on" : ""}`}>
                <input type="checkbox" checked={show.ori} onChange={(e) => setShow({ ...show, ori: e.target.checked })} />
                <span>Drone ORI</span>
              </label>
              <label className={`switch-tag ${show.mun ? "on" : ""}`}>
                <input type="checkbox" checked={show.mun} onChange={(e) => setShow({ ...show, mun: e.target.checked })} />
                <span>Municipal</span>
              </label>
              <label className={`switch-tag ${show.bld ? "on" : ""}`}>
                <input type="checkbox" checked={show.bld} onChange={(e) => setShow({ ...show, bld: e.target.checked })} />
                <span>Buildings</span>
              </label>
              <label className={`switch-tag ${show.dsm ? "on" : ""}`}>
                <input type="checkbox" checked={show.dsm} onChange={(e) => setShow({ ...show, dsm: e.target.checked })} />
                <span>DSM/DTM</span>
              </label>
              <label className={`switch-tag ${show.utility ? "on" : ""}`}>
                <input type="checkbox" checked={show.utility} onChange={(e) => setShow({ ...show, utility: e.target.checked })} />
                <span>Utilities</span>
              </label>
              <label className={`switch-tag ${show.cors ? "on" : ""}`}>
                <input type="checkbox" checked={show.cors} onChange={(e) => setShow({ ...show, cors: e.target.checked })} />
                <span>GNSS / CORS</span>
              </label>
            </div>
          </div>

          <div className="wb-map-canvas">
            {summary && (
              <MapView
                bounds={summary.bounds}
                layers={layers}
                origin={summary.origin_utm}
                furniture
                selectedId={selected}
                onSelect={(id) => pick(id)}
                focus={focus}
                showUtilities={show.utility}
                showElevation={show.dsm}
                showCors={show.cors}
                label="Ward cadastral review canvas"
              />
            )}
          </div>

          {/* Bottom Bar with Status Summary */}
          <div className="wb-bottom-bar">
            <div className="status-metric-pill ok">
              <span className="dot" />
              <span>Auto-Harmonized: <b>{counts.auto_accepted ?? 0}</b></span>
            </div>
            <div className="status-metric-pill flag">
              <span className="dot" />
              <span>Needs Review: <b>{openCount} open</b></span>
            </div>
            <div className="status-metric-pill validated">
              <span className="dot" />
              <span>Officer Approved: <b>{counts.validated ?? 0}</b></span>
            </div>
            <div className="status-metric-pill info">
              <span>Shift: <b>ΔE {summary?.cadastral_shift_m.east}m, ΔN {summary?.cadastral_shift_m.north}m</b></span>
            </div>
          </div>
        </div>

        {/* Right Inspector & Review Drawer */}
        <aside className="wb-sidebar-column">
          {/* Tab navigation */}
          <div className="wb-tabs">
            <button className={`wb-tab ${tab === "queue" ? "active" : ""}`} onClick={() => setTab("queue")}>
              Review Queue ({openCount})
            </button>
            <button className={`wb-tab ${tab === "parcel" ? "active" : ""}`} onClick={() => setTab("parcel")}>
              Parcel Inspector {selected ? `(#${selected})` : ""}
            </button>
            <button className={`wb-tab ${tab === "audit" ? "active" : ""}`} onClick={() => setTab("audit")}>
              Audit Trail
            </button>
          </div>

          <div className="wb-tab-body">
            {/* Tab 1: Queue */}
            {tab === "queue" && (
              <div className="queue-panel">
                <div className="queue-head-info">
                  <div className="queue-shortcuts-tip">
                    <span>Navigation Shortcuts: <kbd>J</kbd> Next • <kbd>K</kbd> Prev</span>
                  </div>
                </div>

                <div className="queue-list">
                  {queue.map((item) => {
                    const isSel = item.id === selected;
                    return (
                      <div
                        key={item.id}
                        className={`queue-item ${isSel ? "selected" : ""} ${item.decision ? "decided" : ""}`}
                        onClick={() => pick(item.id, true)}
                      >
                        <div className="queue-item-head">
                          <strong className="queue-id">{item.key ?? `Plot ${item.id}`}</strong>
                          <span className={`pill-badge ${item.decision ? "pill-ok" : "pill-warn"}`}>
                            {item.decision ? item.decision.toUpperCase() : `${Math.round(item.confidence * 100)}%`}
                          </span>
                        </div>
                        <div className="queue-item-reasons">
                          {item.review_reasons.map((r, ri) => (
                            <span key={ri} className="reason-tag">
                              {r}
                            </span>
                          ))}
                        </div>
                        <div className="queue-item-meta">
                          <span>Owner: <b>{item.owner ?? "Disputed"}</b></span>
                          <span>{Math.round(item.area_sqm)} m²</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab 2: Parcel Inspector */}
            {tab === "parcel" && (
              <div className="parcel-panel">
                {selected && runId ? (
                  <ParcelReviewPanel
                    runId={runId}
                    parcelId={selected}
                    onDecided={() => {
                      refresh();
                      advance();
                    }}
                    onOpenPassbook={() => setShowPassbook(true)}
                  />
                ) : (
                  <div className="empty-panel-prompt">
                    <div className="empty-pin-icon">
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </div>
                    <strong>No parcel selected</strong>
                    <p>Click on any parcel on the map or pick an item from the Review Queue.</p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Tamper-Evident Audit Trail */}
            {tab === "audit" && (
              <div className="audit-panel">
                <div className="audit-status-banner">
                  <span className="audit-badge verified">SHA-256 Hash Chain Verified</span>
                  <small className="audit-sub">Cryptographic tamper-evident chain of all revenue review actions.</small>
                </div>

                <div className="audit-log-stream">
                  {audit?.recent.map((entry) => (
                    <div key={entry.seq} className="audit-entry-card">
                      <div className="audit-seq">#{entry.seq}</div>
                      <div className="audit-details">
                        <div className="audit-action">
                          <strong>{entry.action.toUpperCase()}</strong> on Parcel <b>{entry.parcel}</b>
                        </div>
                        <div className="audit-hash">Hash: <code>{entry.hash.slice(0, 16)}…</code></div>
                        <div className="audit-time">{new Date(entry.at).toLocaleTimeString()}</div>
                      </div>
                    </div>
                  ))}
                  {(!audit || audit.recent.length === 0) && (
                    <p className="muted pad">No officer reviews registered yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {showPassbook && selectedParcelDetail && (
        <NakshaPassbookModal
          parcel={selectedParcelDetail}
          runId={runId ?? "medium-7"}
          onClose={() => setShowPassbook(false)}
        />
      )}
      {showTopoModal && <TopologyVisualizerModal onClose={() => setShowTopoModal(false)} />}
      {showAiModal && <GeoAiFeatureModal onClose={() => setShowAiModal(false)} />}
      {showExportModal && runId && <ExportHubModal runId={runId} onClose={() => setShowExportModal(false)} />}
    </div>
  );
}

function ParcelReviewPanel({
  runId,
  parcelId,
  onDecided,
  onOpenPassbook,
}: {
  runId: string;
  parcelId: string;
  onDecided: () => void;
  onOpenPassbook: () => void;
}) {
  const [detail, setDetail] = useState<ParcelDetail | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.parcel(runId, parcelId).then((p) => {
      setDetail(p);
      const res: Record<string, string> = {};
      for (const c of p.conflicts) {
        if (c.suggestion) res[c.field] = c.suggestion.source;
      }
      setResolutions(res);
      setNote(p.decision?.note ?? "");
    });
  }, [runId, parcelId]);

  if (!detail) return <p className="muted pad">Loading parcel inspection records…</p>;

  const decide = async (decision: "accept" | "reject") => {
    setSubmitting(true);
    try {
      await api.review(runId, parcelId, { decision, resolutions, note });
      onDecided();
    } finally {
      setSubmitting(false);
    }
  };

  const undo = async () => {
    setSubmitting(true);
    try {
      await api.undo(runId, parcelId);
      onDecided();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="inspector-flow">
      <div className="inspector-head">
        <div>
          <span className="parcel-badge">{detail.id}</span>
          <h3 className="inspector-title">{detail.key ?? `Parcel ${detail.id}`}</h3>
        </div>
        <button className="btn-modern btn-ghost btn-sm" onClick={onOpenPassbook}>
          Land Passbook
        </button>
      </div>

      <div className="confidence-breakdown-box">
        <div className="conf-bar-head">
          <span>Overall Confidence:</span>
          <strong>{Math.round(detail.confidence * 100)}%</strong>
        </div>
        <div className="conf-components-grid">
          {Object.entries(detail.components).map(([k, v]) => (
            <div key={k} className="conf-comp-row">
              <span className="comp-lbl">{COMP_LABEL[k] ?? k}</span>
              <div className="comp-bar-bg">
                <div className="comp-bar-fill" style={{ width: `${v * 100}%` }} />
              </div>
              <span className="comp-val">{Math.round(v * 100)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="conflict-resolution-section">
        <h4>Source Records & Resolution Options</h4>
        {detail.conflicts.map((c) => (
          <div key={c.field} className="conflict-card">
            <div className="conf-card-head">
              <strong>{c.kind}</strong>
              <span className={`pill-badge ${c.status === "resolved" ? "pill-ok" : "pill-warn"}`}>
                {c.status === "resolved" ? "Auto-Resolved" : "Action Required"}
              </span>
            </div>

            <div className="source-option-radios">
              {Object.entries(c.values).map(([src, val]) => (
                <label key={src} className="radio-option">
                  <input
                    type="radio"
                    name={`res-${c.field}`}
                    value={src}
                    checked={resolutions[c.field] === src}
                    onChange={() => setResolutions({ ...resolutions, [c.field]: src })}
                  />
                  <div className="opt-desc">
                    <span className="opt-val">"{val}"</span>
                    <span className="opt-src">({SOURCE_LABEL[src] ?? src})</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="review-action-form">
        <label className="input-label">Officer Verification Note:</label>
        <textarea
          className="note-textarea"
          rows={2}
          value={note}
          placeholder="e.g. Ground Truthing verified by Patwari; Municipal tax assessment confirmed."
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="action-button-row">
          {detail.decision ? (
            <button className="btn-modern btn-ghost" disabled={submitting} onClick={undo}>
              Undo Decision
            </button>
          ) : (
            <>
              <button
                className="btn-modern btn-reject"
                disabled={submitting}
                onClick={() => decide("reject")}
              >
                Reject & Reprocess
              </button>
              <button
                className="btn-modern btn-accept"
                disabled={submitting}
                onClick={() => decide("accept")}
              >
                Approve & Harmonize
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
