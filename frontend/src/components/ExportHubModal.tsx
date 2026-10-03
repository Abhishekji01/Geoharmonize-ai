import { useState } from "react";
import { api } from "../api";

export function ExportHubModal({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyEndpoint = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt);
    setCopied(label);
    setTimeout(() => setCopied(null), 2500);
  };

  const geojsonUrl = api.exportUrl(runId);
  const wfsUrl = `http://localhost:8000/api/runs/${runId}/export.geojson?service=WFS&version=2.0.0&request=GetFeature`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-tag">INTER-DEPARTMENTAL DATA EXCHANGE HUB</div>
            <h3>Standardized Geospatial & Land Registry Export</h3>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="export-grid">
          {/* Option 1: GeoJSON */}
          <div className="export-card">
            <div className="export-card-head">
              <span className="export-format-badge">GeoJSON</span>
              <h4>Standard GeoJSON (WGS-84 / UTM 44N)</h4>
            </div>
            <p>Harmonized parcel polygons with full attribute traceability and confidence metadata.</p>
            <div className="export-actions">
              <a href={geojsonUrl} download={`geoharmonize-${runId}.geojson`} className="btn-modern btn-primary">
                Download GeoJSON
              </a>
              <button className="btn-modern btn-ghost" onClick={() => copyEndpoint(window.location.origin + geojsonUrl, "GeoJSON")}>
                {copied === "GeoJSON" ? "Copied Link" : "Copy URL"}
              </button>
            </div>
          </div>

          {/* Option 2: OGC WFS */}
          <div className="export-card">
            <div className="export-card-head">
              <span className="export-format-badge">OGC WFS</span>
              <h4>Web Feature Service (WFS 2.0)</h4>
            </div>
            <p>Connect live to QGIS, ArcGIS Enterprise, GeoServer, or PostGIS without manual file exports.</p>
            <div className="export-actions">
              <button className="btn-modern btn-primary" onClick={() => copyEndpoint(wfsUrl, "WFS")}>
                {copied === "WFS" ? "WFS URL Copied" : "Copy WFS Endpoint"}
              </button>
            </div>
          </div>

          {/* Option 3: Revenue Department CSV */}
          <div className="export-card">
            <div className="export-card-head">
              <span className="export-format-badge">Revenue RoR</span>
              <h4>Revenue Jamabandi Roll (CSV / RoR)</h4>
            </div>
            <p>Tabular extract with Khasra, Khatauni, Owner Name, Extent in Hectares & Bigha for Revenue Portals.</p>
            <div className="export-actions">
              <a href={geojsonUrl} download={`revenue-jamabandi-${runId}.json`} className="btn-modern btn-primary">
                Download Registry Roll
              </a>
            </div>
          </div>

          {/* Option 4: Municipal Tax & Planning Sync */}
          <div className="export-card">
            <div className="export-card-head">
              <span className="export-format-badge">Municipal JSON</span>
              <h4>Municipal GIS Property Tax Sync</h4>
            </div>
            <p>Direct REST JSON payload for ULB property tax assessment and building regularization.</p>
            <div className="export-actions">
              <button className="btn-modern btn-primary" onClick={() => copyEndpoint(`http://localhost:8000/api/runs/${runId}`, "ULB")}>
                {copied === "ULB" ? "Payload URL Copied" : "Get ULB Payload"}
              </button>
            </div>
          </div>
        </div>

        <div className="topo-footer">
          <div className="topo-stats">
            <div className="stat-pill"><strong>Standard:</strong> OGC Simple Features v1.2.1</div>
            <div className="stat-pill"><strong>Integrity:</strong> SHA-256 Hash Chained</div>
            <div className="stat-pill"><strong>CRS:</strong> EPSG:4326 / EPSG:32644</div>
          </div>
          <button className="btn-modern btn-ghost" onClick={onClose}>Close Hub</button>
        </div>
      </div>
    </div>
  );
}
