// One colour per source, used the same way on every map in the product.
export const C = {
  cadastral: "#3A45D6",
  ori: "#D88A00",
  municipal: "#00857A",
  buildings: "#5C6B7E",
  revenue: "#8A5BD0",
  ok: "#0E9B63",
  flag: "#CF2A6A",
  ink: "#0E1A2B",
  mute: "#5B6A7C",
  line: "#C9D2DD",
};
export const SOURCE_LABEL: Record<string, string> = {
  cadastral: "Cadastral map", ori: "Drone ORI", municipal: "Municipal GIS", buildings: "Building footprints", revenue: "Revenue records",
};
export const STATUS_LABEL: Record<string, string> = {
  auto_accepted: "Accepted automatically", needs_review: "Needs review", validated: "Validated by officer", rejected: "Rejected",
};

// confidence -> green ramp, low values read as pale
export function confidenceFill(v: number): string {
  const t = Math.max(0, Math.min(1, (v - 0.4) / 0.6));
  const l = 90 - t * 48; // 90% -> 42%
  return `hsl(155 ${45 + t * 40}% ${l}%)`;
}
