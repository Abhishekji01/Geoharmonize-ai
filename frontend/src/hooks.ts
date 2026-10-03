import { useEffect, useState } from "react";
import { api, type FC, type ParcelDetail, type ParcelProps, type RunSummary } from "./api";

export type WardData = {
  summary: RunSummary;
  harm: FC<ParcelProps>;
  cad: FC;
  ori: FC;
  mun: FC;
  bld: FC;
};

export function useWard(size = "medium", seed = 7) {
  const [data, setData] = useState<WardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    (async () => {
      try {
        const { id } = await api.createRun(seed, size);
        const [summary, harm, cad, ori, mun, bld] = await Promise.all([
          api.summary(id),
          api.harmonised(id),
          api.layer(id, "cadastral"),
          api.layer(id, "ori"),
          api.layer(id, "municipal"),
          api.layer(id, "buildings"),
        ]);
        if (live) setData({ summary, harm, cad, ori, mun, bld });
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not reach the API");
      }
    })();
    return () => {
      live = false;
    };
  }, [size, seed]);
  return { data, error };
}

export function useParcel(runId: string, parcelId: string | null) {
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || !parcelId) {
      setParcel(null);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    api
      .parcel(runId, parcelId)
      .then((p) => {
        if (live) {
          setParcel(p);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [runId, parcelId]);

  return { parcel, loading, error };
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
