// Official GovTech & Modern Cartographic Palette
export const C = {
  // Base surfaces
  sheet: "#F8FAFC",
  sheetCard: "#FFFFFF",
  sheet2: "#F1F5F9",
  ink: "#0F172A",
  ink2: "#334155",
  mute: "#64748B",
  soft: "#CBD5E1",
  border: "#E2E8F0",
  borderDark: "#1E293B",

  // Datasets
  cadastral: "#2563EB",   // Revenue Cadastral Blue
  ori: "#D97706",         // Drone Ortho Imagery Amber
  municipal: "#0D9488",   // Municipal GIS Teal
  buildings: "#475569",   // Building Footprints Slate
  dsm: "#7C3AED",         // DSM/DTM Elevation Purple
  utility: "#0284C7",     // Underground Utilities Cyan/Blue
  cors: "#DB2777",        // GNSS/CORS Survey Pink
  gt: "#EAB308",          // Ground Truthing Yellow
  revenue: "#4F46E5",     // Revenue Jamabandi Indigo
  geoai: "#10B981",       // GeoAI Boundary Extraction Green

  // Status & Validation
  ok: "#10B981",          // Approved / Auto-Accepted Emerald
  flag: "#EF4444",        // Conflict / Review Red
  warn: "#F59E0B",        // Discrepancy Amber
  brand: "#1E293B",       // Slate Brand
  accent: "#2563EB",      // Primary Blue Accent
};

export const DATASET_CATALOG = [
  { id: "cadastral", name: "Existing Cadastral Maps", crs: "EPSG:4326", color: C.cadastral, status: "modelled", dept: "Revenue Department", tag: "Vector Polygon", desc: "Historical land parcel boundaries with legacy survey offsets and ring vertex noise." },
  { id: "ori", name: "Orthorectified Drone Imagery (ORI)", crs: "EPSG:32644", color: C.ori, status: "modelled", dept: "Survey of India / NAKSHA", tag: "5cm Aerial Ortho", desc: "High-resolution orthomosaic imagery with automated boundary and edge detection." },
  { id: "revenue", name: "Revenue Land Records (RoR)", crs: "Tabular", color: C.revenue, status: "modelled", dept: "Revenue Administration", tag: "Jamabandi / Khasra", desc: "Official ownership ledgers, area extents, and recorded land-use classifications." },
  { id: "municipal", name: "Municipal GIS & Property Tax", crs: "EPSG:3857", color: C.municipal, status: "modelled", dept: "Urban Local Body (ULB)", tag: "Assessment GIS", desc: "Property assessment IDs, built-up areas, zoning plans, and municipal asset registers." },
  { id: "buildings", name: "Building Footprint Datasets", crs: "EPSG:32644", color: C.buildings, status: "modelled", dept: "Town Planning Authority", tag: "Footprint Vector", desc: "Rooftop boundary polygons utilized for change detection and encroachment analysis." },
  { id: "dsm", name: "DSM / DTM Elevation Models", crs: "EPSG:32644", color: C.dsm, status: "integrated", dept: "Survey of India", tag: "Elevation Grid", desc: "Digital Surface and Terrain Models for 3D building height analysis and terrain slope." },
  { id: "utility", name: "Utility Network Infrastructure", crs: "EPSG:32644", color: C.utility, status: "integrated", dept: "Jal Board / Power Utilities", tag: "Network Corridors", desc: "Underground water pipelines, power conduits, and drainage corridors with easement clash detection." },
  { id: "cors", name: "GNSS / CORS Survey Control", crs: "EPSG:32644", color: C.cors, status: "integrated", dept: "Survey of India CORS", tag: "RTK Baseline", desc: "Continuously Operating Reference Station network baselines providing sub-centimeter geodetic control." },
  { id: "gt", name: "Ground Truthing (GT) Datasets", crs: "EPSG:32644", color: C.gt, status: "integrated", dept: "Field Verification Survey", tag: "Field GCPs", desc: "Field ground control points and mobile verification markers for empirical ground validation." },
  { id: "geoai", name: "GeoAI Feature Extraction", crs: "EPSG:32644", color: C.geoai, status: "integrated", dept: "Vision Processing Core", tag: "Neural SegMask", desc: "Deep neural network boundary segmentations with polygonal regularization." },
];

export const SOURCE_LABEL: Record<string, string> = {
  cadastral: "Cadastral Map",
  ori: "Drone ORI Survey",
  municipal: "Municipal GIS",
  buildings: "Building Footprints",
  revenue: "Revenue Jamabandi",
  dsm: "DSM/DTM Elevation",
  utility: "Utility Infrastructure",
  cors: "GNSS / CORS",
  gt: "Ground Truthing (GT)",
};

export const STATUS_LABEL: Record<string, string> = {
  auto_accepted: "Auto-Harmonized",
  needs_review: "Action Required",
  validated: "Officer Approved",
  rejected: "Rejected / Reprocess",
};

// Confidence gradient from red -> amber -> emerald
export function confidenceFill(v: number): string {
  if (v >= 0.85) return "#10B981";
  if (v >= 0.70) return "#34D399";
  if (v >= 0.55) return "#F59E0B";
  return "#EF4444";
}

export function hatchCss(color: string): string {
  return `repeating-linear-gradient(135deg, ${color} 0 1.5px, transparent 1.5px 5px)`;
}
