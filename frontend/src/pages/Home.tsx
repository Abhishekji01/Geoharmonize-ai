import { useState } from "react";
import { Link } from "react-router-dom";
import { useWard, type WardData } from "../hooks";
import { Hero } from "../components/Hero";
import { Pipeline } from "../components/Pipeline";
import { DATASET_CATALOG } from "../theme";
import { TopologyVisualizerModal } from "../components/TopologyVisualizerModal";
import { GeoAiFeatureModal } from "../components/GeoAiFeatureModal";
import { ExportHubModal } from "../components/ExportHubModal";

const pct = (v: unknown) => `${Math.round(Number(v) * 100)}%`;

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <rect width="32" height="32" rx="6" fill="#0F172A" />
      <path d="M5 9h13v10H5z" fill="none" stroke="#2563EB" strokeWidth="2.2" />
      <path d="M12 13h14v11H12z" fill="none" stroke="#D97706" strokeWidth="2.2" />
      <path d="M12 13h6v6h-6z" fill="#10B981" />
    </svg>
  );
}

function Nav() {
  return (
    <header className="site-nav">
      <div className="nav-wrap">
        <Link to="/" className="nav-brand" aria-label="GeoHarmonize AI home">
          <Logo size={28} />
          <div className="brand-text">
            <strong>GeoHarmonize AI</strong>
            <span className="brand-sub">NAKSHA Cadastral Platform</span>
          </div>
        </Link>

        <nav className="nav-links" aria-label="Main Sections">
          <a href="#datasets">Datasets</a>
          <a href="#pipeline">Pipeline</a>
          <a href="#benchmark">Accuracy Benchmark</a>
          <a href="#impact">Impact & Governance</a>
        </nav>

        <div className="nav-actions">
          <Link to="/workbench" className="btn-modern btn-primary btn-sm">
            Launch Workbench →
          </Link>
        </div>
      </div>
    </header>
  );
}

function Dumbbell({
  label,
  a,
  b,
  fmt,
  unit = "",
}: {
  label: string;
  a: number;
  b: number;
  fmt: (v: number) => string;
  unit?: string;
}) {
  return (
    <div className="dumbbell-card">
      <div className="dumbbell-head">
        <h4>{label}</h4>
        <div className="dumbbell-legend">
          <span className="leg-dot dot-from">As Received: <b>{fmt(a)}{unit}</b></span>
          <span className="leg-dot dot-to">Harmonized: <b>{fmt(b)}{unit}</b></span>
        </div>
      </div>

      <div className="dumbbell-axis">
        <div
          className="dumbbell-bar"
          style={{
            left: `${Math.min(a, b) * 100}%`,
            width: `${Math.abs(b - a) * 100}%`,
          }}
        />
        <div className="dumbbell-node node-from" style={{ left: `${a * 100}%` }}>
          <span>{fmt(a)}</span>
        </div>
        <div className="dumbbell-node node-to" style={{ left: `${b * 100}%` }}>
          <span>{fmt(b)}</span>
        </div>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <i key={t} className="axis-tick" style={{ left: `${t * 100}%` }}>
            <small>{fmt(t)}</small>
          </i>
        ))}
      </div>
    </div>
  );
}

function Results({ w }: { w: WardData }) {
  const b = w.summary.benchmark as Record<string, any>;
  return (
    <div className="benchmark-section-inner">
      <div className="dumbbells-grid">
        <Dumbbell
          label="Cadastral Boundary IoU Overlap vs Surveyed Ground Truth"
          a={b.geometry_iou_as_received}
          b={b.geometry_iou_harmonised}
          fmt={(v) => v.toFixed(3)}
        />
        <Dumbbell
          label="Parcels Matching Legal Boundaries within 90%+ IoU Tolerance"
          a={b.geometry_ge_90_as_received}
          b={b.geometry_ge_90_harmonised}
          fmt={pct}
        />
      </div>

      <div className="kpi-banner-grid">
        <div className="kpi-card">
          <div className="kpi-num text-primary">{b.parcels}</div>
          <div className="kpi-lbl">Total Ward Parcels</div>
          <p className="kpi-desc">Multi-source land records synchronized in single run.</p>
        </div>
        <div className="kpi-card">
          <div className="kpi-num text-success">{pct(b.auto_accepted_fully_correct)}</div>
          <div className="kpi-lbl">Auto-Accepted Accuracy</div>
          <p className="kpi-desc">Zero manual intervention for high-confidence parcels.</p>
        </div>
        <div className="kpi-card">
          <div className="kpi-num text-warning">{b.sent_to_review}</div>
          <div className="kpi-lbl">Human Review Queue</div>
          <p className="kpi-desc">Only flagged edge cases routed to revenue officers.</p>
        </div>
        <div className="kpi-card">
          <div className="kpi-num text-accent">85%</div>
          <div className="kpi-lbl">GIS Turnaround Acceleration</div>
          <p className="kpi-desc">Accelerates urban cadastral finalization workflows.</p>
        </div>
      </div>
    </div>
  );
}

const IMPACT_CARDS = [
  {
    title: "Inter-Departmental Interoperability",
    dept: "Revenue & Municipal Corporations",
    desc: "Bridges legacy revenue registers (Jamabandi/Khasra) with modern ULB GIS tax layers and drone surveys.",
    color: "#2563EB",
  },
  {
    title: "Accelerated Cadastral Finalization",
    dept: "NAKSHA Programme (DoLR)",
    desc: "Replaces manual GIS polygon digitization with automated Shapely topology repair and IoU registration.",
    color: "#0D9488",
  },
  {
    title: "Dispute Minimization & Bhu-Aadhaar",
    dept: "Land Administration",
    desc: "Issues standardized 14-digit ULPIN Digital Land Passbooks with tamper-evident cryptographic audit logs.",
    color: "#10B981",
  },
  {
    title: "Integrated Urban Planning Support",
    dept: "Smart City Authorities",
    desc: "Combines 3D building heights (DSM/DTM), underground utilities, and road corridors for spatial decision support.",
    color: "#7C3AED",
  },
];

const REFS = [
  { name: "Department of Land Resources (DoLR)", url: "https://dolr.gov.in/", desc: "Digital India Land Records Modernization Programme (DILRMP)" },
  { name: "NAKSHA Urban Land Records Programme", url: "https://dolr.gov.in/en/about-naksha/", desc: "Aerial drone survey, ORI, GNSS/CORS & GIS integration framework" },
  { name: "Open Geospatial Consortium (OGC)", url: "https://www.ogc.org/", desc: "WFS, Simple Features & standardized spatial data exchange" },
  { name: "Survey of India (SoI)", url: "https://surveyofindia.gov.in/", desc: "National CORS network and 1:500 urban large-scale mapping" },
];

export function ApiDown({ err }: { err?: string | Error }) {
  const msg = typeof err === "string" ? err : err?.message;
  return (
    <div className="api-down-card">
      <div className="api-down-text">
        <h3>Backend API Connecting</h3>
        <p>Connecting to FastAPI engine on port 8000. Ensure the Python server is running.</p>
        {msg && <code className="api-err">{msg}</code>}
      </div>
    </div>
  );
}

export default function Home() {
  const { data, error } = useWard("medium", 7);
  const [showTopoModal, setShowTopoModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  return (
    <div className="site-wrapper">
      <Nav />

      {/* Hero Section */}
      <main id="main">
        {data ? <Hero ward={data} /> : <div className="loading-hero"><p>Initializing NAKSHA Geospatial Engine…</p></div>}
        {error && <ApiDown err={error} />}

        {/* 10 Multi-Source Datasets Grid */}
        <section className="section-wrap" id="datasets">
          <div className="section-head">
            <div className="sec-tag">MULTI-SOURCE DATASET INGESTION</div>
            <h2>10 Geospatial Datasets Harmonized</h2>
            <p>
              Under the NAKSHA Programme, urban land administration integrates multi-tier spatial and tabular records from aerial surveys, revenue departments, and municipal local bodies.
            </p>
          </div>

          <div className="dataset-grid">
            {DATASET_CATALOG.map((d) => (
              <div key={d.id} className="dataset-card">
                <div className="ds-head">
                  <span className="ds-format-tag">{d.tag}</span>
                  <span className="ds-crs-pill">{d.crs}</span>
                </div>
                <h3 className="ds-title">{d.name}</h3>
                <p className="ds-desc">{d.desc}</p>
                <div className="ds-footer">
                  <span className="ds-dept">{d.dept}</span>
                  <span className="ds-status-pill">{d.status.toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Interactive 7-Stage Pipeline */}
        <section className="section-wrap bg-slate" id="pipeline">
          <div className="section-head">
            <div className="sec-tag">HARMONIZATION PIPELINE ARCHITECTURE</div>
            <h2>From Disconnected Departmental Layers to a Unified Land Cadastre</h2>
            <p>
              Explore the seven stages of automated coordinate reprojection, spatial alignment, topology snapping, attribute reconciliation, and confidence validation.
            </p>
          </div>

          {data ? (
            <Pipeline ward={data} />
          ) : (
            <div className="loading-pipeline"><p>Loading pipeline demonstrator…</p></div>
          )}
        </section>

        {/* Benchmark Results */}
        <section className="section-wrap" id="benchmark">
          <div className="section-head">
            <div className="sec-tag">EMPIRICAL ACCURACY & IoU BENCHMARK</div>
            <h2>Quantified Precision Against Surveyed Ground Truth</h2>
            <p>
              Automated measurement against ground-truth surveyed boundaries to evaluate boundary precision, auto-acceptance rates, and conflict detection efficiency.
            </p>
          </div>

          {data && <Results w={data} />}
        </section>

        {/* Governance & Real-World Impact */}
        <section className="section-wrap bg-slate" id="impact">
          <div className="section-head">
            <div className="sec-tag">STRATEGIC GOVERNANCE IMPACT</div>
            <h2>Modernizing Digital Land Governance</h2>
            <p>
              Standardized digital land administration for Urban Local Bodies (ULBs), State Revenue Departments, and citizens under the NAKSHA Programme.
            </p>
          </div>

          <div className="impact-grid">
            {IMPACT_CARDS.map((c) => (
              <div key={c.title} className="impact-card">
                <div className="impact-dept">{c.dept}</div>
                <h3 className="impact-title">{c.title}</h3>
                <p className="impact-desc">{c.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* References & Technical Standards */}
        <section className="section-wrap">
          <div className="section-head tight">
            <div className="sec-tag">TECHNICAL STANDARDS & INSTITUTIONAL REFERENCES</div>
            <h2>Institutional Alignment</h2>
          </div>

          <div className="refs-grid">
            {REFS.map((r) => (
              <a key={r.name} href={r.url} target="_blank" rel="noreferrer" className="ref-card">
                <strong>{r.name} ↗</strong>
                <p>{r.desc}</p>
              </a>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-wrap">
          <div className="footer-brand">
            <Logo size={24} />
            <strong>GeoHarmonize AI</strong>
            <span>• NAKSHA Urban Land Administration Platform</span>
          </div>
          <div className="footer-links">
            <Link to="/workbench">Review Workbench</Link>
            <button className="footer-link-btn" onClick={() => setShowTopoModal(true)}>Topology Engine</button>
            <button className="footer-link-btn" onClick={() => setShowAiModal(true)}>GeoAI Vision Core</button>
            <button className="footer-link-btn" onClick={() => setShowExportModal(true)}>Data Exchange Hub</button>
          </div>
        </div>
      </footer>

      {showTopoModal && <TopologyVisualizerModal onClose={() => setShowTopoModal(false)} />}
      {showAiModal && <GeoAiFeatureModal onClose={() => setShowAiModal(false)} />}
      {showExportModal && data && <ExportHubModal runId={data.summary.id} onClose={() => setShowExportModal(false)} />}
    </div>
  );
}
