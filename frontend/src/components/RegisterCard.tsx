import { useState } from "react";
import { useParcel } from "../hooks";
import { SOURCE_LABEL, STATUS_LABEL } from "../theme";
import { NakshaPassbookModal } from "./NakshaPassbookModal";

export function RegisterCard({
  runId,
  id,
  onPick,
  className,
}: {
  runId: string;
  id: string | null;
  onPick?: (id: string | null) => void;
  className?: string;
}) {
  const { parcel, loading } = useParcel(runId, id);
  const [showPassbook, setShowPassbook] = useState(false);

  if (!id) {
    return (
      <aside className={`reg empty ${className ?? ""}`} aria-live="polite">
        <div className="empty-state">
          <div className="empty-pin-icon">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <strong>Select a parcel boundary on the map</strong>
          <small>Inspect multi-source attribute concordance, cross-departmental records, and generate the official NAKSHA Bhu-Aadhaar Passbook.</small>
        </div>
      </aside>
    );
  }

  if (loading || !parcel) {
    return (
      <aside className={`reg loading ${className ?? ""}`} aria-busy="true">
        <p className="muted">Retrieving multi-source parcel records…</p>
      </aside>
    );
  }

  const sources = parcel.sources;

  return (
    <>
      <aside className={`reg ${className ?? ""}`} aria-live="polite">
        <header className="reg-head">
          <div>
            <div className="reg-key-row">
              <span className="parcel-badge">{parcel.id}</span>
              <span className={`status-pill pill-${parcel.status}`}>
                {STATUS_LABEL[parcel.status] ?? parcel.status}
              </span>
            </div>
            <h3 className="reg-title">{parcel.key ?? `Plot ${parcel.id}`}</h3>
          </div>
          <div className="reg-score-badge">
            <span className="score-num">{Math.round(parcel.confidence * 100)}%</span>
            <small className="score-lbl">Confidence</small>
          </div>
        </header>

        <div className="reg-actions-row">
          <button className="btn-naksha-passbook" onClick={() => setShowPassbook(true)}>
            View NAKSHA Land Passbook (ULPIN)
          </button>
        </div>

        <div className="reg-table-wrapper">
          <table className="reg-table">
            <thead>
              <tr>
                <th>Attribute</th>
                {sources.map((s: string) => (
                  <th key={s}>{SOURCE_LABEL[s] ?? s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Owner</th>
                {sources.map((s: string) => {
                  const val = parcel.values.owner?.[s];
                  const agrees = parcel.owner_agrees?.[s] !== false;
                  return (
                    <td key={s} className={!val ? "none" : agrees ? "" : "off"}>
                      {val ?? "—"}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>Land Use</th>
                {sources.map((s: string) => {
                  const val = parcel.values.land_use?.[s];
                  const agrees = parcel.land_use_agrees?.[s] !== false;
                  return (
                    <td key={s} className={!val ? "none" : agrees ? "" : "off"}>
                      {val ?? "—"}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>Extent</th>
                {sources.map((s: string) => (
                  <td key={s}>{parcel.values.area_sqm?.[s] ? `${parcel.values.area_sqm[s]} m²` : "—"}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {parcel.conflicts.length > 0 && (
          <div className="reg-conflicts">
            <h4>Active Discrepancies ({parcel.conflicts.length})</h4>
            {parcel.conflicts.map((c: any, i: number) => (
              <div key={i} className={`conflict-chip ${c.status === "resolved" ? "resolved" : "flagged"}`}>
                <span className="conflict-kind">{c.kind}</span>
                <span className="conflict-status">{c.status === "resolved" ? "Settled by Rule" : "Requires Review"}</span>
              </div>
            ))}
          </div>
        )}

        <footer className="reg-foot">
          <div className="foot-metrics">
            <span><strong>Footprint Area:</strong> {Math.round(parcel.area_sqm)} m²</span>
            <span><strong>Buildings:</strong> {parcel.buildings} detected</span>
          </div>
          {onPick && (
            <button className="btn-close-card" onClick={() => onPick(null)} aria-label="Close parcel view">
              Deselect
            </button>
          )}
        </footer>
      </aside>

      {showPassbook && (
        <NakshaPassbookModal
          parcel={parcel}
          runId={runId}
          onClose={() => setShowPassbook(false)}
        />
      )}
    </>
  );
}
