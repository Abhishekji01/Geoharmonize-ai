import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CatalogRow } from "../api";
import { useWard, type WardData } from "../hooks";
import { HeroMap } from "../components/HeroMap";
import { Pipeline } from "../components/Pipeline";

const pct = (v: unknown) => `${Math.round(Number(v) * 100)}%`;

function Nav() {
  return (
    <header className="nav">
      <Link to="/" className="brand" aria-label="GeoHarmonize AI home">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden><rect width="32" height="32" rx="3" fill="#0E1A2B" /><path d="M5 9h13v10H5z" fill="none" stroke="#7B86F2" strokeWidth="2" /><path d="M12 13h14v11H12z" fill="none" stroke="#F0A81A" strokeWidth="2" /><path d="M12 13h6v6h-6z" fill="#17B879" /></svg>
        GeoHarmonize AI
      </Link>
      <nav aria-label="Sections">
        <a href="#inputs">Inputs</a><a href="#stages">Stages</a><a href="#results">Results</a><a href="#feasibility">Feasibility</a><a href="#impact">Impact</a>
      </nav>
      <Link to="/workbench" className="btn small">Open workbench</Link>
    </header>
  );
}

function Compare({ label, a, b, fmt = pct }: { label: string; a: number; b: number; fmt?: (v: number) => string }) {
  return (
    <div className="cmp">
      <div className="cmp-label">{label}</div>
      <div className="cmp-row"><span>As received</span><div className="bar"><i style={{ width: `${a * 100}%`, background: "var(--cad)" }} /></div><b>{fmt(a)}</b></div>
      <div className="cmp-row"><span>Harmonized</span><div className="bar"><i style={{ width: `${b * 100}%`, background: "var(--ok)" }} /></div><b>{fmt(b)}</b></div>
    </div>
  );
}

function Results({ w }: { w: WardData }) {
  const b = w.summary.benchmark as Record<string, any>;
  return (
    <div className="results">
      <div>
        <Compare label="Boundary overlap with the surveyed truth (IoU)" a={b.geometry_iou_as_received} b={b.geometry_iou_harmonised} fmt={(v) => v.toFixed(2)} />
        <Compare label="Parcels that overlap the truth by 90% or more" a={b.geometry_ge_90_as_received} b={b.geometry_ge_90_harmonised} />
      </div>
      <dl className="facts">
        <div><dt>Parcels in the ward</dt><dd>{b.parcels}</dd></div>
        <div><dt>Parcels where at least one source had a wrong owner or land use</dt><dd>{b.records_with_source_errors}</dd></div>
        <div><dt>Of those, surfaced as a conflict</dt><dd>{pct(b.source_errors_surfaced)}</dd></div>
        <div><dt>Accepted without a person</dt><dd>{b.auto_accepted} <small>of {b.parcels}</small></dd></div>
        <div><dt>Of those, fully correct</dt><dd>{pct(b.auto_accepted_fully_correct)}</dd></div>
        <div><dt>Sent to human validation</dt><dd>{b.sent_to_review}</dd></div>
      </dl>
      <p className="caveat">{String(b.note)} The ward is generated, so the answer is known and the pipeline can be scored against it. Real wards will be messier, and the first job on real data is to repeat this measurement with surveyed ground truth.</p>
    </div>
  );
}

const RISKS: [string, string, string][] = [
  ["Heterogeneous datasets", "ETL automation and standard geospatial formats", "Partly built. GeoJSON in and out; more formats planned"],
  ["CRS and schema inconsistency", "Automated CRS and schema normalisation", "Built"],
  ["Spatial inaccuracies", "Geometry tolerance and spatial matching", "Built"],
  ["Conflicting departmental records", "Source-aware conflict rules", "Built"],
  ["AI feature-extraction errors", "Confidence scoring and human-in-the-loop validation", "Built"],
  ["Large geospatial datasets", "Cloud and parallel processing", "Planned"],
];
const MILESTONES: [string, string][] = [
  ["Data", "Five source layers on a synthetic ward"], ["Match", "Spatial matching and alignment"], ["Harmonize", "Topology, attributes, change detection"],
  ["Validate", "Conflict rules, scoring, review queue"], ["Visualize", "Workbench with export"],
];
const IMPACT: [string, string][] = [
  ["Government", "Inter-departmental spatial data interoperability"],
  ["Land administration", "Faster cadastral integration and finalization workflows"],
  ["Accuracy", "Automated validation and confidence scoring help identify discrepancies"],
  ["Data exchange", "Standardized GIS/API-ready land information"],
  ["Efficiency", "Reduced repetitive manual GIS integration effort"],
  ["Urban planning", "Integrated land, building, utility and municipal information for spatial decision support"],
];
const REFS: [string, string, string][] = [
  ["Department of Land Resources, Government of India", "https://dolr.gov.in/", "Digital land records and land administration"],
  ["NAKSHA Programme", "https://dolr.gov.in/en/about-naksha/", "Urban land records, aerial survey, ORI, GNSS/field survey and GIS-integrated cadastral context"],
  ["Open Geospatial Consortium (OGC)", "https://www.ogc.org/", "Geospatial interoperability and standardized data exchange"],
  ["PostGIS", "https://postgis.net/", "Spatial database and geospatial queries"],
  ["GeoPandas", "https://geopandas.org/", "Vector geospatial data processing"],
  ["GDAL", "https://gdal.org/", "Raster/vector data transformation and processing"],
];

export default function Home() {
  const { data, error } = useWard("medium", 7);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  useEffect(() => { api.catalog().then(setCatalog).catch(() => {}); }, []);

  return (
    <>
      <Nav />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>Four departments. Four maps of the same plots.</h1>
            <p className="lede">GeoHarmonize AI lines up cadastral maps, revenue records, drone imagery and municipal layers into one land record and scores every parcel for confidence. Officers review only what the system can't settle.</p>
            <div className="actions">
              <Link to="/workbench" className="btn">Open the workbench</Link>
              <a href="#stages" className="btn ghost">See the seven stages</a>
            </div>
            <p className="fine">Built for Smart India Hackathon 2026, problem statement 26013: automated integration and intelligent harmonization of multi-source geospatial data for urban land record management.</p>
          </div>
          <div className="hero-art">
            {data ? <HeroMap ward={data} /> : <div className="hero-map loading">{error ? <ApiDown msg={error} /> : "Loading the sample ward"}</div>}
            <p className="art-note">Sample ward with {data?.summary.parcels ?? "…"} parcels. The data is synthetic. Drag the line.</p>
          </div>
        </section>

        <section id="inputs" className="band">
          <div className="wrap split">
            <div>
              <h2>Ten kinds of land data, and none of them agree</h2>
              <p>The problem statement names ten datasets. They arrive in different coordinate systems, with different plot references, owner spellings and land-use codes. This build runs five of them end to end and says plainly where the rest stand.</p>
            </div>
            <ul className="catalog">
              {catalog.map((c) => (
                <li key={c.name}>
                  <span className={`dot ${c.status}`} aria-hidden />
                  <div><b>{c.name}</b><small>{c.note}</small></div>
                  <em>{c.status === "modelled" ? "Modelled" : c.status === "extraction" ? "Extraction output" : "Planned"}</em>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="stages" className="wrap stages">
          <div className="stages-head">
            <h2>How five records become one parcel</h2>
            <p>Scroll through the stages. The map shows what that stage does to the same ward, and every number comes from the API run you are looking at.</p>
          </div>
          {data ? <Pipeline ward={data} /> : <p className="muted">{error ? <ApiDown msg={error} /> : "Running the pipeline…"}</p>}
        </section>

        <section id="results" className="band alt">
          <div className="wrap">
            <h2>What the sample ward shows</h2>
            {data ? <Results w={data} /> : <p className="muted">Waiting for the run.</p>}
          </div>
        </section>

        <section id="feasibility" className="wrap feas">
          <h2>What can go wrong, and what we do about it</h2>
          <table className="risks">
            <thead><tr><th>Challenge</th><th>Mitigation</th><th>In this build</th></tr></thead>
            <tbody>{RISKS.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td className={c === "Built" ? "yes" : c === "Planned" ? "no" : "part"}>{c}</td></tr>)}</tbody>
          </table>
          <h3 className="sub">Prototype scope</h3>
          <p className="muted narrow">The idea submission scopes the prototype to two or three representative geospatial data sources. This build already runs five synthetic layers through the same five steps, and the architecture is modular, so any step can be swapped without touching the others.</p>
          <ol className="miles">
            {MILESTONES.map(([a, b], i) => <li key={a} className={a === "Harmonize" ? "big" : ""}><span>{i + 1}</span><b>{a}</b><small>{b}</small></li>)}
          </ol>
        </section>

        <section id="impact" className="band">
          <div className="wrap">
            <h2>Why it matters to the people who run land records</h2>
            <dl className="impact">{IMPACT.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
            <p className="closing">Multiple departments, one harmonized spatial view, and faster, more consistent, interoperable digital land governance.</p>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <h2 className="foot-h">References</h2>
          <ol className="refs">
            {REFS.map(([n, u, d]) => <li key={n}><b>{n}</b><span>{d}</span><a href={u} target="_blank" rel="noreferrer">{u}</a></li>)}
          </ol>
          <p className="fine">GeoHarmonize AI, Smart India Hackathon 2026, PS 26013. All parcels, owners and records on this site are synthetic.</p>
        </div>
      </footer>
    </>
  );
}

export function ApiDown({ msg }: { msg: string }) {
  return <span className="apidown">Can't reach the API ({msg}). Start it with <code>uvicorn app.main:app</code> from the backend folder.</span>;
}
