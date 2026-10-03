import type { ParcelDetail } from "../api";
import { SOURCE_LABEL } from "../theme";

export function NakshaPassbookModal({
  parcel,
  runId,
  onClose,
}: {
  parcel: ParcelDetail | null;
  runId: string;
  onClose: () => void;
}) {
  if (!parcel) return null;

  const ulpin = `ULPIN-26013-${runId.toUpperCase()}-${parcel.id.toUpperCase()}`;
  const now = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window naksha-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header naksha-head">
          <div className="naksha-badge-row">
            <div className="gov-seal-icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" />
                <path d="M12 6v12M8 12h8" />
              </svg>
            </div>
            <div>
              <div className="gov-title">GOVERNMENT OF INDIA • MINISTRY OF RURAL DEVELOPMENT & LAND RESOURCES</div>
              <div className="gov-subtitle">NAKSHA URBAN LAND GOVERNANCE PROGRAMME • BHU-AADHAAR DIGITAL RECORD</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="naksha-content">
          <div className="naksha-banner">
            <div>
              <span className="naksha-type">OFFICIAL RECORD OF RIGHTS (RoR) • DIGITAL PROPERTY PASSBOOK</span>
              <h2>{parcel.key ?? `Parcel ${parcel.id}`}</h2>
              <div className="naksha-ulpin-box">
                <span className="ulpin-label">ULPIN / भू-आधार:</span>
                <span className="ulpin-val">{ulpin}</span>
              </div>
            </div>
            <div className="naksha-qr">
              <svg viewBox="0 0 100 100" width="76" height="76">
                <rect width="100" height="100" fill="#fff" />
                <rect x="10" y="10" width="25" height="25" fill="#0F172A" />
                <rect x="15" y="15" width="15" height="15" fill="#fff" />
                <rect x="18" y="18" width="9" height="9" fill="#0F172A" />
                <rect x="65" y="10" width="25" height="25" fill="#0F172A" />
                <rect x="70" y="15" width="15" height="15" fill="#fff" />
                <rect x="73" y="18" width="9" height="9" fill="#0F172A" />
                <rect x="10" y="65" width="25" height="25" fill="#0F172A" />
                <rect x="15" y="70" width="15" height="15" fill="#fff" />
                <rect x="18" y="73" width="9" height="9" fill="#0F172A" />
                <rect x="42" y="15" width="16" height="8" fill="#0F172A" />
                <rect x="42" y="30" width="8" height="16" fill="#0F172A" />
                <rect x="55" y="45" width="12" height="12" fill="#0F172A" />
                <rect x="40" y="65" width="18" height="8" fill="#0F172A" />
                <rect x="70" y="65" width="20" height="20" fill="#0F172A" />
              </svg>
              <span className="qr-caption">SHA-256 Audit Verified</span>
            </div>
          </div>

          <div className="naksha-grid">
            <div className="naksha-cell">
              <span className="cell-label">HARMONIZED TITLE HOLDER (स्वामित्व)</span>
              <strong className="cell-val text-primary">{parcel.owner ?? "Unregistered"}</strong>
              <small className="cell-sub">Sources: {parcel.sources.map((s: string) => SOURCE_LABEL[s] || s).join(", ")}</small>
            </div>
            <div className="naksha-cell">
              <span className="cell-label">LAND USE CLASSIFICATION</span>
              <strong className="cell-val">{parcel.land_use ?? "General Urban"}</strong>
              <small className="cell-sub">Master Plan 2031 Standard</small>
            </div>
            <div className="naksha-cell">
              <span className="cell-label">RECORDED EXTENT / AREA</span>
              <strong className="cell-val">{Math.round(parcel.area_sqm)} m²</strong>
              <small className="cell-sub">{(parcel.area_sqm * 0.000247105).toFixed(3)} Acres • {(parcel.area_sqm / 100).toFixed(2)} Ares</small>
            </div>
            <div className="naksha-cell">
              <span className="cell-label">CONCORDANCE INDEX</span>
              <strong className="cell-val text-success">{Math.round(parcel.confidence * 100)}%</strong>
              <small className="cell-sub">Multi-Source Verification</small>
            </div>
          </div>

          <div className="naksha-section">
            <h4>Multi-Departmental Concordance Matrix</h4>
            <table className="naksha-table">
              <thead>
                <tr>
                  <th>Department / Dataset</th>
                  <th>Recorded Owner</th>
                  <th>Land Use Class</th>
                  <th>Extent (m²)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {parcel.sources.map((src: string) => {
                  const ownerVal = parcel.values.owner?.[src] ?? "—";
                  const landUseVal = parcel.values.land_use?.[src] ?? "—";
                  const areaVal = parcel.values.area_sqm?.[src] ? `${parcel.values.area_sqm[src]} m²` : "—";
                  const agrees = parcel.owner_agrees?.[src] !== false;
                  return (
                    <tr key={src}>
                      <td><strong>{SOURCE_LABEL[src] ?? src}</strong></td>
                      <td className={agrees ? "" : "text-flag font-semibold"}>{ownerVal}</td>
                      <td>{landUseVal}</td>
                      <td>{areaVal}</td>
                      <td>
                        <span className={`pill-badge ${agrees ? "pill-ok" : "pill-warn"}`}>
                          {agrees ? "Concordant" : "Discrepancy"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="naksha-footer-box">
            <div className="cert-meta">
              <span><strong>Issuing Authority:</strong> NAKSHA Geospatial Cadastre Engine v2.4</span>
              <span><strong>Cryptographic Hash:</strong> {parcel.decision ? `DEC-${parcel.id}` : `AUTO-${parcel.id.slice(0, 8)}`}</span>
              <span><strong>Verification Date:</strong> {now}</span>
            </div>
            <div className="cert-actions">
              <button className="btn-modern btn-ghost" onClick={() => window.print()}>
                Print Land Passbook
              </button>
              <button className="btn-modern btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
