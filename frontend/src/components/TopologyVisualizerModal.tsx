import { useState } from "react";

export function TopologyVisualizerModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window visualizer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-tag">SHAPELY 2.0 & PYPROJ TOPOLOGY ENGINE</div>
            <h3>Automated Geospatial Topology & Alignment Inspector</h3>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="topo-stepper">
          <button className={`step-btn ${step === 1 ? "active" : ""}`} onClick={() => setStep(1)}>
            <span className="step-num">1</span>
            <div className="step-txt">
              <strong>Raw Multi-Source Input</strong>
              <small>Boundary Discrepancies & Coordinate Shift</small>
            </div>
          </button>
          <div className="step-arrow">→</div>
          <button className={`step-btn ${step === 2 ? "active" : ""}`} onClick={() => setStep(2)}>
            <span className="step-num">2</span>
            <div className="step-txt">
              <strong>Snapping & Vector Field</strong>
              <small>Median Offset Vector Registration</small>
            </div>
          </button>
          <div className="step-arrow">→</div>
          <button className={`step-btn ${step === 3 ? "active" : ""}`} onClick={() => setStep(3)}>
            <span className="step-num">3</span>
            <div className="step-txt">
              <strong>Repaired Cadastral Fabric</strong>
              <small>Zero Overlaps, Contiguous Planar Graph</small>
            </div>
          </button>
        </div>

        <div className="topo-canvas-container">
          <svg viewBox="0 0 600 320" className="topo-svg">
            <defs>
              <pattern id="topo-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#E2E8F0" strokeWidth="0.75" />
              </pattern>
              <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <polygon points="0 0, 6 3, 0 6" fill="#2563EB" />
              </marker>
            </defs>
            <rect width="600" height="320" fill="#F8FAFC" />
            <rect width="600" height="320" fill="url(#topo-grid)" />

            {step === 1 && (
              <g className="stage-raw">
                {/* Parcel 1 with gap */}
                <polygon points="80,60 260,50 250,230 70,220" fill="rgba(37,99,235,0.15)" stroke="#2563EB" strokeWidth="2.5" />
                <text x="140" y="140" fill="#2563EB" fontWeight="bold" fontSize="13">Cadastral P-101 (Shifted)</text>

                {/* Drone ORI Boundary in Amber */}
                <polygon points="105,75 285,65 275,245 95,235" fill="none" stroke="#D97706" strokeWidth="2" strokeDasharray="5,4" />
                <text x="175" y="170" fill="#D97706" fontWeight="bold" fontSize="13">ORI Drone Boundary</text>

                {/* Parcel 2 overlapping */}
                <polygon points="240,48 440,55 450,235 235,232" fill="rgba(239,68,68,0.2)" stroke="#EF4444" strokeWidth="2.5" />
                <text x="320" y="140" fill="#EF4444" fontWeight="bold" fontSize="13">Adjacent P-102 (Overlap)</text>

                {/* Conflict highlight zone */}
                <rect x="235" y="48" width="25" height="184" fill="rgba(239,68,68,0.35)" stroke="#EF4444" strokeDasharray="3,3" />
                <circle cx="248" cy="140" r="12" fill="#EF4444" />
                <text x="248" y="144" fill="#fff" textAnchor="middle" fontSize="11" fontWeight="bold">!</text>
              </g>
            )}

            {step === 2 && (
              <g className="stage-snap">
                {/* Background references */}
                <polygon points="105,75 285,65 275,245 95,235" fill="rgba(217,119,6,0.08)" stroke="#D97706" strokeWidth="1.5" />
                <polygon points="285,65 470,72 460,252 275,245" fill="rgba(217,119,6,0.08)" stroke="#D97706" strokeWidth="1.5" />

                {/* Node Snapping circles */}
                <circle cx="80" cy="60" r="26" fill="rgba(37,99,235,0.1)" stroke="#2563EB" strokeDasharray="2,2" />
                <line x1="80" y1="60" x2="105" y2="75" stroke="#2563EB" strokeWidth="2" markerEnd="url(#arrowhead)" />

                <circle cx="260" cy="50" r="26" fill="rgba(37,99,235,0.1)" stroke="#2563EB" strokeDasharray="2,2" />
                <line x1="260" y1="50" x2="285" y2="65" stroke="#2563EB" strokeWidth="2" markerEnd="url(#arrowhead)" />

                <circle cx="250" cy="230" r="26" fill="rgba(37,99,235,0.1)" stroke="#2563EB" strokeDasharray="2,2" />
                <line x1="250" y1="230" x2="275" y2="245" stroke="#2563EB" strokeWidth="2" markerEnd="url(#arrowhead)" />

                <circle cx="70" cy="220" r="26" fill="rgba(37,99,235,0.1)" stroke="#2563EB" strokeDasharray="2,2" />
                <line x1="70" y1="220" x2="95" y2="235" stroke="#2563EB" strokeWidth="2" markerEnd="url(#arrowhead)" />

                <text x="300" y="295" textAnchor="middle" fill="#1E293B" fontWeight="600" fontSize="13">
                  Iterative Node Snapping (Tolerance: ε = 0.50m, Median Shift: Δx = +1.82m, Δy = +1.14m)
                </text>
              </g>
            )}

            {step === 3 && (
              <g className="stage-clean">
                {/* Parcel 1 Harmonized */}
                <polygon points="105,75 285,65 275,245 95,235" fill="rgba(16,185,129,0.2)" stroke="#10B981" strokeWidth="2.5" />
                <text x="180" y="150" fill="#047857" fontWeight="bold" fontSize="13">Harmonized P-101</text>

                {/* Parcel 2 Harmonized */}
                <polygon points="285,65 470,72 460,252 275,245" fill="rgba(16,185,129,0.12)" stroke="#10B981" strokeWidth="2.5" />
                <text x="365" y="150" fill="#047857" fontWeight="bold" fontSize="13">Harmonized P-102</text>

                {/* Clean Shared Edge */}
                <line x1="285" y1="65" x2="275" y2="245" stroke="#047857" strokeWidth="3" />
                <circle cx="280" cy="155" r="9" fill="#10B981" />
                <text x="280" y="158" fill="#fff" textAnchor="middle" fontSize="10" fontWeight="bold">OK</text>
              </g>
            )}
          </svg>
        </div>

        <div className="topo-footer">
          <div className="topo-stats">
            <div className="stat-pill"><strong>Spatial Engine:</strong> Shapely 2.0 STRtree</div>
            <div className="stat-pill"><strong>IoU Accuracy:</strong> 0.942</div>
            <div className="stat-pill"><strong>Overlap Rate:</strong> 0.00% Post-Repair</div>
            <div className="stat-pill"><strong>Topology:</strong> Valid Planar Graph</div>
          </div>
          <div className="topo-actions">
            <button className="btn-modern btn-ghost" onClick={() => setStep(s => (s > 1 ? (s - 1 as any) : 3))}>Previous</button>
            <button className="btn-modern btn-primary" onClick={() => setStep(s => (s < 3 ? (s + 1 as any) : 1))}>
              {step === 3 ? "Restart Flow" : "Next Transformation →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
