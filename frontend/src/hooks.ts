import { useEffect, useState } from "react";
import { api, type FC, type ParcelProps, type RunSummary } from "./api";

export type WardData = {
  summary: RunSummary; harm: FC<ParcelProps>;
  cad: FC; ori: FC; mun: FC; bld: FC;
};

export function useWard(size = "medium", seed = 7) {
  const [data, setData] = useState<WardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setData(null); setError(null);
    (async () => {
      try {
        const { id } = await api.createRun(seed, size);
        const [summary, harm, cad, ori, mun, bld] = await Promise.all([
          api.summary(id), api.harmonised(id), api.layer(id, "cadastral"), api.layer(id, "ori"),
          api.layer(id, "municipal"), api.layer(id, "buildings"),
        ]);
        if (live) setData({ summary, harm, cad, ori, mun, bld });
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not reach the API");
      }
    })();
    return () => { live = false; };
  }, [size, seed]);
  return { data, error };
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
