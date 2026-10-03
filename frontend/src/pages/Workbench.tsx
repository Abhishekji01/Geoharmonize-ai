import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type FC, type ParcelDetail, type ParcelProps, type RunSummary } from "../api";
import { useWard } from "../hooks";
import { MapView, type LayerSpec } from "../components/MapView";
import { C, SOURCE_LABEL, STATUS_LABEL, confidenceFill } from "../theme";
import { ApiDown } from "./Home";

type Queue = (ParcelProps & { decision: string | null })[];
const COMP_LABEL: Record<string, string> = { geometry: "Boundaries agree", attributes: "Records agree", extraction: "Drone detection", coverage: "Sources covering it" };

export default function Workbench() {
  const [size, setSize] = useState("medium");
  const [seed, setSeed] = useState(7);
  const [seedText, setSeedText] = useState("7");
  const { data, error } = useWard(size, seed);

  const [harm, setHarm] = useState<FC<ParcelProps> | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [queue, setQueue] = useState<Queue>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [tab, setTab] = useState<"queue" | "parcel">("queue");
  const [mode, setMode] = useState<"status" | "confidence">("status");
  const [show, setShow] = useState({ bld: true, cad: false, ori: false, mun: false });

  const runId = data?.summary.id;
  const refresh = useCallback(async () => {
    if (!runId) return;
    const [h, s, q] = await Promise.all([api.harmonised(runId), api.summary(runId), api.queue(runId)]);
    setHarm(h); setSummary(s); setQueue(q);
  }, [runId]);

  useEffect(() => { if (data) { setHarm(data.harm); setSummary(data.summary); setSelected(null); setTab("queue"); api.queue(data.summary.id).then(setQueue); } }, [data]);

  const pick = (id: string | null, zoom = false) => {
    setSelected(id);
    if (id) { setTab("parcel"); if (zoom) setFocus({ id, nonce: Date.now() }); }
  };

  const layers = useMemo<LayerSpec[]>(() => {
    if (!data || !harm) return [];
    const out: LayerSpec[] = [];
    if (show.bld) out.push({ id: "bld", data: data.bld, style: () => ({ fill: C.buildings, fillOpacity: 0.28 }) });
    if (show.mun) out.push({ id: "mun", data: data.mun, style: () => ({ stroke: C.municipal, width: 1, dash: "3 2" }) });
    if (show.cad) out.push({ id: "cad", data: data.cad, style: () => ({ stroke: C.cadastral, width: 1.2 }) });
    if (show.ori) out.push({ id: "ori", data: data.ori, style: () => ({ stroke: C.ori, width: 1.2 }) });
    out.push({
      id: "harm", data: harm, interactive: true,
      style: (f) => {
        const p = f.properties as ParcelProps;
        if (mode === "confidence") return { fill: confidenceFill(p.confidence), fillOpacity: 0.85, stroke: p.status === "needs_review" ? C.flag : "#fff", width: p.status === "needs_review" ? 2 : 0.8 };
        if (p.status === "needs_review") return { fill: C.flag, fillOpacity: 0.45, stroke: C.flag, width: 1.3 };
        if (p.status === "validated") return { fill: C.ok, fillOpacity: 0.8, stroke: C.ok, width: 1.2 };
        if (p.status === "rejected") return { fill: "#94A3B8", fillOpacity: 0.45, stroke: "#64748B", width: 1.2, dash: "4 3" };
        return { fill: C.ok, fillOpacity: 0.2, stroke: C.ok, width: 0.9 };
      },
    });
    return out;
  }, [data, harm, show, mode]);

  const counts = summary?.status_counts ?? {};
  const open = queue.filter((q) => !q.decision).length;

  return (
    <div className="wb">
      <header className="wb-bar">
        <Link to="/" className="brand" aria-label="Back to the overview">
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden><rect width="32" height="32" rx="3" fill="#0E1A2B" /><path d="M5 9h13v10H5z" fill="none" stroke="#7B86F2" strokeWidth="2" /><path d="M12 13h14v11H12z" fill="none" stroke="#F0A81A" strokeWidth="2" /><path d="M12 13h6v6h-6z" fill="#17B879" /></svg>
          Workbench
        </Link>
        <div className="wb-run">
          <label>Ward size
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
            </select>
          </label>
          <label>Seed
            <input inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onBlur={() => { const n = Number(seedText || 0); setSeed(n); setSeedText(String(n)); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          </label>
        </div>
        <div className="wb-count" aria-live="polite">
          {summary && <>{summary.parcels} parcels, {counts.auto_accepted ?? 0} accepted automatically, {(counts.validated ?? 0)} validated, {open} waiting for a person</>}
        </div>
        {runId && <a className="btn small" href={api.exportUrl(runId)}>Export GeoJSON</a>}
      </header>

      <div className="wb-body">
        <section className="wb-map" aria-label="Map">
          {data && harm ? (
            <>
              <MapView bounds={data.summary.bounds} layers={layers} selectedId={selected} onSelect={(id) => pick(id)} focus={focus} label="Harmonized parcels" />
              <div className="wb-tools">
                <fieldset>
                  <legend>Colour by</legend>
                  <label><input type="radio" name="mode" checked={mode === "status"} onChange={() => setMode("status")} />Status</label>
                  <label><input type="radio" name="mode" checked={mode === "confidence"} onChange={() => setMode("confidence")} />Confidence</label>
                </fieldset>
                <fieldset>
                  <legend>Source layers underneath</legend>
                  {([["cad", "Cadastral map", C.cadastral], ["ori", "Drone ORI", C.ori], ["mun", "Municipal GIS", C.municipal], ["bld", "Buildings", C.buildings]] as const).map(([k, l, c]) => (
                    <label key={k}><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} /><i style={{ background: c }} />{l}</label>
                  ))}
                </fieldset>
              </div>
              <ul className="map-legend wb-legend">
                {mode === "status" ? (
                  <><li><i style={{ background: C.ok, opacity: 0.4 }} />Accepted automatically</li><li><i style={{ background: C.flag }} />Needs review</li><li><i style={{ background: C.ok }} />Validated</li><li><i style={{ background: "#94A3B8" }} />Rejected</li></>
                ) : (
                  <><li><i style={{ background: confidenceFill(0.98) }} />High confidence</li><li><i style={{ background: confidenceFill(0.5) }} />Low</li><li><i style={{ background: C.flag }} />Outlined: needs review</li></>
                )}
              </ul>
            </>
          ) : <div className="loading pad">{error ? <ApiDown msg={error} /> : "Running the pipeline on the sample ward…"}</div>}
        </section>

        <aside className="wb-side">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "queue"} onClick={() => setTab("queue")}>Review queue <span>{open}</span></button>
            <button role="tab" aria-selected={tab === "parcel"} onClick={() => setTab("parcel")} disabled={!selected}>Parcel{selected ? ` ${selected}` : ""}</button>
          </div>
          {tab === "queue" && (
            <ul className="queue">
              {queue.length === 0 && <li className="empty">Nothing to review. Every parcel was accepted automatically.</li>}
              {queue.map((q) => (
                <li key={q.id}>
                  <button onClick={() => pick(q.id, true)} className={q.id === selected ? "on" : ""}>
                    <span className="q-top"><b>{q.id}</b><span className="q-key">{q.key ?? "no plot reference"}</span><span className="q-score">{q.confidence.toFixed(2)}</span></span>
                    <span className="q-why">{q.decision ? (q.decision === "accept" ? "Validated" : "Rejected") : q.review_reasons[0] ?? "Low confidence"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tab === "parcel" && runId && selected && <ParcelPanel runId={runId} id={selected} onChanged={refresh} />}
        </aside>
      </div>
    </div>
  );
}

function ParcelPanel({ runId, id, onChanged }: { runId: string; id: string; onChanged: () => Promise<void> }) {
  const [d, setD] = useState<ParcelDetail | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const p = await api.parcel(runId, id);
    setD(p);
    const init: Record<string, string> = {};
    for (const c of p.conflicts) if (c.status === "flagged" && (c.field === "owner" || c.field === "land_use") && c.suggestion) init[c.field] = c.suggestion.source;
    setChoice(p.decision?.resolutions ?? init);
    setNote(p.decision?.note ?? "");
    setErr(null);
  }, [runId, id]);
  useEffect(() => { setD(null); load().catch((e) => setErr(String(e.message))); }, [load]);

  if (!d) return <div className="panel pad">{err ?? "Loading parcel…"}</div>;

  const pending = d.conflicts.filter((c) => c.status === "flagged" && (c.field === "owner" || c.field === "land_use") && !choice[c.field]);
  const act = async (decision: "accept" | "reject") => {
    setBusy(true); setErr(null);
    try { await api.review(runId, id, { decision, resolutions: decision === "accept" ? choice : {}, note }); await load(); await onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save the decision"); }
    setBusy(false);
  };
  const undo = async () => { setBusy(true); await api.undo(runId, id); await load(); await onChanged(); setBusy(false); };
  const seen = new Set<string>();

  return (
    <div className="panel">
      <div className="p-head">
        <div><h2>{d.id}</h2><p>{d.key ?? "No plot reference"}</p></div>
        <div className="p-score"><b>{d.confidence.toFixed(2)}</b><small>confidence</small></div>
      </div>
      <p className={`p-status s-${d.status}`}>{STATUS_LABEL[d.status]}</p>
      {d.review_reasons.length > 0 && <p className="p-why">Sent to review because: {d.review_reasons.map((r) => r.toLowerCase()).join("; ")}.</p>}

      <dl className="final">
        <div><dt>Owner</dt><dd>{d.owner ?? "Unknown"}</dd></div>
        <div><dt>Land use</dt><dd>{d.land_use ?? "Unknown"}</dd></div>
        <div><dt>Area from surveyed boundary</dt><dd>{d.area_sqm.toLocaleString()} m²</dd></div>
      </dl>

      <h3>Why this score</h3>
      <ul className="comps">
        {Object.entries(d.components).map(([k, v]) => (
          <li key={k}><span>{COMP_LABEL[k] ?? k}</span><div className="bar"><i style={{ width: `${v * 100}%`, background: v < 0.6 ? C.flag : C.ok }} /></div><b>{v.toFixed(2)}</b></li>
        ))}
      </ul>
      <p className="p-src">Seen in {d.sources.map((s) => SOURCE_LABEL[s] ?? s).join(", ")}.</p>

      {d.conflicts.length > 0 && <h3>Conflicts</h3>}
      {d.conflicts.map((c, i) => {
        const radios = (c.field === "owner" || c.field === "land_use") && c.status === "flagged" && !seen.has(c.field);
        if (radios) seen.add(c.field);
        const opts = Object.entries(d.values[c.field as "owner" | "land_use"] ?? {});
        return (
          <fieldset key={i} className={`conf ${c.status}`} disabled={!!d.decision || d.status === "auto_accepted"}>
            <legend>{c.kind}</legend>
            {radios ? opts.map(([src, val]) => (
              <label key={src}>
                <input type="radio" name={`${c.field}`} checked={choice[c.field] === src} onChange={() => setChoice({ ...choice, [c.field]: src })} />
                <span><b>{SOURCE_LABEL[src] ?? src}</b> {String(val)}{c.suggestion?.source === src && <em> suggested, {c.suggestion.rule.toLowerCase()}</em>}</span>
              </label>
            )) : (
              <ul>{Object.entries(c.values).map(([k, v]) => <li key={k}><b>{SOURCE_LABEL[k] ?? k.replace("_", " ")}</b> {String(v)}</li>)}</ul>
            )}
            {c.status === "resolved" && c.resolution && <p className="rule">Settled by rule: {c.resolution.rule.toLowerCase()}, {String(c.resolution.value)}.</p>}
            {c.status === "flagged" && !radios && <p className="rule">Needs a person to look at it.</p>}
          </fieldset>
        );
      })}

      {(d.changes.length > 0 || d.edits.length > 0) && <h3>What changed</h3>}
      {d.changes.length > 0 && <ul className="plain">{d.changes.map((c) => <li key={c}>{c}</li>)}</ul>}
      {d.edits.length > 0 && <ul className="plain mute">{d.edits.map((c) => <li key={c}>{c}</li>)}</ul>}

      {d.status === "auto_accepted" ? (
        <p className="p-auto">Accepted automatically: score {d.confidence.toFixed(2)} and no open conflict. Nothing to review.</p>
      ) : d.decision ? (
        <div className="decided">
          <p>{d.decision.decision === "accept" ? "You validated this parcel" : "You rejected this parcel"}{d.decision.note ? `: ${d.decision.note}` : "."}</p>
          <button className="btn ghost small" onClick={undo} disabled={busy}>Undo decision</button>
        </div>
      ) : (
        <div className="actions-col">
          <label className="note">Note for the record <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></label>
          {pending.length > 0 && <p className="hint">Choose a value for {pending.map((p) => p.field.replace("_", " ")).join(" and ")} to accept.</p>}
          <div className="row">
            <button className="btn" disabled={busy || pending.length > 0} onClick={() => act("accept")}>Accept parcel</button>
            <button className="btn ghost" disabled={busy} onClick={() => act("reject")}>Reject parcel</button>
          </div>
        </div>
      )}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}
