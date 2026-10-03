import { useEffect, useState } from "react";
import { api, type ParcelDetail } from "../api";
import { SOURCE_LABEL, STATUS_LABEL } from "../theme";

const ROWS = ["revenue", "cadastral", "municipal"] as const;

/** One plot, what each department wrote down about it. Values that disagree with the harmonized record get a red-pencil underline. */
export function RegisterCard({ runId, id, className = "", layout = "stack" }: { runId: string; id: string | null; className?: string; layout?: "stack" | "row" }) {
  const [d, setD] = useState<ParcelDetail | null>(null);
  useEffect(() => {
    if (!id) { setD(null); return; }
    let live = true;
    api.parcel(runId, id).then((p) => live && setD(p)).catch(() => live && setD(null));
    return () => { live = false; };
  }, [runId, id]);

  if (!id || !d) {
    return (
      <aside className={`reg empty ${layout} ${className}`} aria-live="polite">
        <p>Select any plot to compare what each department recorded for it.</p>
      </aside>
    );
  }
  const off = Object.values(d.owner_agrees).some((v) => !v) || Object.values(d.land_use_agrees).some((v) => !v);
  if (layout === "row") {
    return (
      <aside className={`reg row ${className}`} aria-live="polite">
        <div className="cell id"><b>{d.key ?? "No plot reference"}</b><span>{d.id}</span><p>{off ? "These records describe the same plot differently." : "These records agree."}</p></div>
        {ROWS.map((s) => {
          const owner = d.values.owner[s], use = d.values.land_use[s];
          return (
            <div className="cell" key={s}>
              <small>{SOURCE_LABEL[s]}</small>
              {owner ? <b className={d.owner_agrees[s] ? "" : "off"}>{owner}</b> : <b className="none">no record</b>}
              {use ? <span className={d.land_use_agrees[s] ? "" : "off"}>{use}</span> : <span className="none">no record</span>}
            </div>
          );
        })}
        <div className="cell">
          <small>Drone imagery</small>
          <b className={d.detection_confidence == null ? "none" : ""}>{d.detection_confidence == null ? "Not detected" : "Boundary found"}</b>
          {d.detection_confidence != null && <span>{d.detection_confidence.toFixed(2)} confidence</span>}
        </div>
        <div className="cell final">
          <small>Harmonized</small>
          <b>{d.owner ?? "Unknown"}</b>
          <span>{d.land_use ?? "Unknown"}, {d.area_sqm.toLocaleString()} m²</span>
          <em><strong>{d.confidence.toFixed(2)}</strong> {STATUS_LABEL[d.status].toLowerCase()}</em>
        </div>
      </aside>
    );
  }
  return (
    <aside className={`reg ${className}`} aria-live="polite">
      <header>
        <b>{d.key ?? "No plot reference"}</b>
        <span>{d.id}</span>
      </header>
      <p className="reg-lede">{off ? "These records describe the same plot differently." : "These records agree."}</p>
      <table>
        <thead><tr><th scope="col"><span className="sr">Source</span></th><th scope="col">Owner</th><th scope="col">Land use</th></tr></thead>
        <tbody>
          {ROWS.map((s) => {
            const owner = d.values.owner[s], use = d.values.land_use[s];
            return (
              <tr key={s}>
                <th scope="row">{SOURCE_LABEL[s]}</th>
                {owner ? <td className={d.owner_agrees[s] ? "" : "off"}>{owner}</td> : <td className="none">no record</td>}
                {use ? <td className={d.land_use_agrees[s] ? "" : "off"}>{use}</td> : <td className="none">no record</td>}
              </tr>
            );
          })}
          <tr>
            <th scope="row">Drone imagery</th>
            <td colSpan={2} className={d.detection_confidence == null ? "none" : ""}>
              {d.detection_confidence == null ? "boundary not detected" : `boundary detected, ${d.detection_confidence.toFixed(2)} confidence`}
            </td>
          </tr>
        </tbody>
      </table>
      <footer>
        <div><small>Harmonized</small><b>{d.owner ?? "Unknown"}</b><span>{d.land_use ?? "Unknown"}, {d.area_sqm.toLocaleString()} m²</span></div>
        <div className="reg-score"><b>{d.confidence.toFixed(2)}</b><small>{STATUS_LABEL[d.status]}</small></div>
      </footer>
    </aside>
  );
}
