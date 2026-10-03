import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CatalogRow } from "../api";
import { useWard, type WardData } from "../hooks";
import { Hero } from "../components/Hero";
import { Pipeline } from "../components/Pipeline";

const pct = (v: unknown) => `${Math.round(Number(v) * 100)}%`;

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <rect width="32" height="32" fill="#101B27" />
      <path d="M5 9h13v10H5z" fill="none" stroke="#8C97FF" strokeWidth="2" />
      <path d="M12 13h14v11H12z" fill="none" stroke="#F2A81D" strokeWidth="2" />
      <path d="M12 13h6v6h-6z" fill="#3DBE84" />
    </svg>
  );
}

function Nav() {
  return (
    <header className="nav">
      <Link to="/" className="brand" aria-label="GeoHarmonize AI home"><Logo />GeoHarmonize AI</Link>
      <nav aria-label="Sections">
        <a href="#inputs">Inputs</a><a href="#stages">Stages</a><a href="#results">Results</a><a href="#feasibility">Feasibility</a><a href="#impact">Impact</a>
      </nav>
      <Link to="/workbench" className="btn small">Open workbench</Link>
    </header>
  );
}

/** Two dots on a 0 to 1 line: where the layers started, where the harmonized record landed. */
function Dumbbell({ label, a, b, fmt }: { label: string; a: number; b: number; fmt: (v: number) => string }) {
  return (
    <div className="dumb">
      <h3>{label}</h3>
      <p className="dumb-key"><i className="k-from" />As received<i className="k-to" />Harmonized</p>
      <div className="dumb-axis">
        <div className="dumb-line" style={{ left: `${Math.min(a, b) * 100}%`, width: `${Math.abs(b - a) * 100}%` }} />
        <div className="dumb-dot from" style={{ left: `${a * 100}%` }}><b>{fmt(a)}</b></div>
        <div className="dumb-dot to" style={{ left: `${b * 100}%` }}><b>{fmt(b)}</b></div>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => <i key={t} className="dumb-tick" style={{ left: `${t * 100}%` }}><span>{fmt(t)}</span></i>)}
      </div>
    </div>
  );
}

function Results({ w }: { w: WardData }) {
  const b = w.summary.benchmark as Record<string, any>;
  return (
    <div className="results">
      <div className="dumbs">
        <Dumbbell label="How closely parcel boundaries match the surveyed truth" a={b.geometry_iou_as_received} b={b.geometry_iou_harmonised} fmt={(v) => v.toFixed(2)} />
        <Dumbbell label="Share of parcels that match it to within 10%" a={b.geometry_ge_90_as_received} b={b.geometry_ge_90_harmonised} fmt={pct} />
      </div>
      <div className="prose-nums">
        <p>In this ward of <b>{b.parcels}</b> parcels, <b>{b.records_with_source_errors}</b> had a wrong owner or land use in at least one source. Every one of them surfaced as a conflict.</p>
        <p><b>{b.auto_accepted}</b> parcels were accepted without a person, and <b>{pct(b.auto_accepted_fully_correct)}</b> of those were fully correct. The other <b>{b.sent_to_review}</b> went to a reviewer.</p>
        <p className="caveat">{String(b.note)} Real wards will be messier. The first job on real data is to repeat this measurement against surveyed ground truth.</p>
      </div>
    </div>
  );
}

type Status = "built" | "part" | "planned";
const RISKS: [string, string, Status, string][] = [
  ["Heterogeneous datasets", "ETL automation and standard geospatial formats", "part", "GeoJSON in and out so far"],
  ["CRS and schema inconsistency", "Automated CRS and schema normalisation", "built", ""],
  ["Spatial inaccuracies", "Geometry tolerance and spatial matching", "built", ""],
  ["Conflicting departmental records", "Source-aware conflict rules", "built", ""],
  ["AI feature-extraction errors", "Confidence scoring and human-in-the-loop validation", "built", ""],
  ["Large geospatial datasets", "Cloud and parallel processing", "planned", ""],
];
const MILESTONES: [string, string][] = [
  ["Data", "Five source layers on a synthetic ward"], ["Match", "Spatial matching and alignment"], ["Harmonize", "Topology, attributes, change detection"],
  ["Validate", "Conflict rules, scoring, review queue"], ["Visualize", "Workbench with export"],
];
const IMPACT: [string, string, string][] = [
  ["Government", "Inter-departmental spatial data interoperability", "#101B27"],
  ["Land administration", "Faster cadastral integration and finalization workflows", "#00796F"],
  ["Accuracy", "Automated validation and confidence scoring help identify discrepancies", "#1E8E5A"],
  ["Data exchange", "Standardized GIS/API-ready land information", "#2438C9"],
  ["Efficiency", "Reduced repetitive manual GIS integration effort", "#D63B2F"],
  ["Urban planning", "Integrated land, building, utility and municipal information for spatial decision support", "#D58A00"],
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
        {data ? <Hero ward={data} /> : <section className="sheet loading-sheet"><p>{error ? <ApiDown msg={error} /> : "Loading the sample ward"}</p></section>}

        <section id="inputs" className="inputs">
          <div className="wrap">
            <div className="sec-head">
              <h2>Ten kinds of land data, and none of them agree</h2>
              <p>The problem statement names ten datasets. They arrive in different coordinate systems, with different plot references, owner spellings and land-use codes. This build runs five of them end to end and says plainly where the rest stand.</p>
            </div>
            <ul className="ledger" aria-label="Datasets named in the problem statement">
              {catalog.map((c) => (
                <li key={c.name} className={c.status}>
                  <span className="mark" aria-hidden />
                  <h3>{c.name}</h3>
                  <p>{c.note}</p>
                  <em>{c.status === "modelled" ? "Modelled" : c.status === "extraction" ? "Extraction output" : "Planned"}</em>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="stages" className="wrap stages">
          <div className="sec-head tight">
            <h2>How five records become one parcel</h2>
            <p>Scroll through the stages. The map shows what each one does to the same ward, and every number comes from the run you are looking at.</p>
          </div>
          {data ? <Pipeline ward={data} /> : <p className="muted">{error ? <ApiDown msg={error} /> : "Running the pipeline…"}</p>}
        </section>

        <section id="results" className="results-sec">
          <div className="wrap">
            <h2>What the sample ward shows</h2>
            {data ? <Results w={data} /> : <p className="muted">Waiting for the run.</p>}
          </div>
        </section>

        <section id="feasibility" className="wrap feas">
          <h2>What can go wrong, and what we do about it</h2>
          <ul className="leaders">
            {RISKS.map(([a, b, st, note]) => (
              <li key={a} className={st}>
                <h3>{a}</h3><i className="dots" aria-hidden /><p>{b}</p>
                <span className="state"><u aria-hidden />{st === "built" ? "Built" : st === "part" ? "Partly built" : "Planned"}{note && <small>{note}</small>}</span>
              </li>
            ))}
          </ul>
          <div className="proto">
            <h3>Prototype scope</h3>
            <p>The idea submission scopes the prototype to two or three representative geospatial data sources. This build already runs five synthetic layers through the same five steps, and the architecture is modular, so any step can be swapped without touching the others.</p>
          </div>
          <ol className="miles">
            {MILESTONES.map(([a, b], i) => <li key={a} className={a === "Harmonize" ? "big" : ""}><span>{i + 1}</span><b>{a}</b><small>{b}</small></li>)}
          </ol>
        </section>

        <section id="impact" className="impact-sec">
          <div className="wrap">
            <h2>Why it matters to the people who run land records</h2>
            <dl className="impact">{IMPACT.map(([a, b, c]) => <div key={a} style={{ ["--c" as any]: c }}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
            <p className="closing">Multiple departments, one harmonized spatial view, and faster, more consistent, interoperable digital land governance.</p>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <h2>References</h2>
          <ol className="refs">
            {REFS.map(([n, u, d]) => <li key={n}><b>{n}</b><span>{d}</span><a href={u} target="_blank" rel="noreferrer">{u}</a></li>)}
          </ol>
          <p className="fine">GeoHarmonize AI, built for Smart India Hackathon 2026, problem statement 26013. All parcels, owners and records on this site are synthetic.</p>
        </div>
      </footer>
    </>
  );
}

export function ApiDown({ msg }: { msg: string }) {
  return <span className="apidown">Can't reach the API ({msg}). Start it with <code>uvicorn app.main:app</code> from the backend folder.</span>;
}
