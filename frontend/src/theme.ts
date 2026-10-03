// Colours follow survey-sheet conventions and mean the same thing on every map.
export const C = {
  sheet: "#F9FAFA",
  ink: "#101B27",
  ink2: "#2F3E4E",
  mute: "#5A6773",
  soft: "#C9D1D6",
  cadastral: "#2438C9", // survey blue
  ori: "#D58A00",       // orange pencil
  municipal: "#00796F",
  buildings: "#55606B",
  ok: "#1E8E5A",
  flag: "#D63B2F",      // red pencil: somebody has to look at this
};
export const SOURCE_LABEL: Record<string, string> = {
  cadastral: "Cadastral map", ori: "Drone imagery", municipal: "Municipal GIS", buildings: "Building footprints", revenue: "Revenue register",
};
export const STATUS_LABEL: Record<string, string> = {
  auto_accepted: "Accepted automatically", needs_review: "Needs review", validated: "Validated by officer", rejected: "Rejected",
};

// confidence -> green ramp; low values read as pale
export function confidenceFill(v: number): string {
  const t = Math.max(0, Math.min(1, (v - 0.4) / 0.6));
  return `hsl(150 ${35 + t * 35}% ${92 - t * 52}%)`;
}

/** Hatch swatch for legends, matching the map patterns. */
export function hatchCss(color: string): string {
  return `repeating-linear-gradient(135deg, ${color} 0 1.4px, transparent 1.4px 4px)`;
}
