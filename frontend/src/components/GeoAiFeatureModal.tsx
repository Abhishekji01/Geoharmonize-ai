import { useState } from "react";

export function GeoAiFeatureModal({ onClose }: { onClose: () => void }) {
  const [modelType, setModelType] = useState<"sam" | "yolo">("sam");
  const [showMask, setShowMask] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [showHeights, setShowHeights] = useState(true);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window visualizer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-tag">COMPUTER VISION & GEO-AI INFERENCE CORE</div>
            <h3>Drone ORI Feature Extraction & Rooftop Segmentation</h3>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="ai-controls-bar">
          <div className="ai-model-toggle">
            <span className="ctrl-label">Backbone Network:</span>
            <button className={`toggle-pill ${modelType === "sam" ? "active" : ""}`} onClick={() => setModelType("sam")}>
              Segment Anything (SAM-Geo)
            </button>
            <button className={`toggle-pill ${modelType === "yolo" ? "active" : ""}`} onClick={() => setModelType("yolo")}>
              YOLOv8-OBB Cadastral
            </button>
          </div>

          <div className="ai-layer-toggles">
            <label className="checkbox-pill">
              <input type="checkbox" checked={showMask} onChange={(e) => setShowMask(e.target.checked)} />
              <span>Confidence Heatmap</span>
            </label>
            <label className="checkbox-pill">
              <input type="checkbox" checked={showEdges} onChange={(e) => setShowEdges(e.target.checked)} />
              <span>Vector Contours</span>
            </label>
            <label className="checkbox-pill">
              <input type="checkbox" checked={showHeights} onChange={(e) => setShowHeights(e.target.checked)} />
              <span>DSM 3D Heights</span>
            </label>
          </div>
        </div>

        <div className="ai-canvas-wrapper">
          <svg viewBox="0 0 600 320" className="ai-svg">
            <defs>
              <linearGradient id="drone-grass" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#222B22" />
                <stop offset="50%" stopColor="#1B241B" />
                <stop offset="100%" stopColor="#141C14" />
              </linearGradient>
              <pattern id="road-texture" width="40" height="40" patternUnits="userSpaceOnUse">
                <rect width="40" height="40" fill="#2E333B" />
                <line x1="20" y1="0" x2="20" y2="40" stroke="#4A525E" strokeWidth="2" strokeDasharray="6,6" />
              </pattern>
            </defs>

            {/* Aerial Base Simulation */}
            <rect width="600" height="320" fill="url(#drone-grass)" />
            {/* Road Corridor */}
            <polygon points="0,120 600,100 600,150 0,170" fill="url(#road-texture)" />

            {/* AI Heatmap Mask Overlay */}
            {showMask && (
              <g className="ai-heatmaps" opacity="0.6">
                <ellipse cx="140" cy="70" rx="65" ry="38" fill="#10B981" filter="blur(6px)" />
                <ellipse cx="420" cy="65" rx="80" ry="42" fill="#10B981" filter="blur(6px)" />
                <ellipse cx="160" cy="240" rx="75" ry="48" fill="#10B981" filter="blur(6px)" />
                <ellipse cx="440" cy="235" rx="70" ry="44" fill="#3B82F6" filter="blur(6px)" />
              </g>
            )}

            {/* Rooftop Polygons */}
            <polygon points="90,42 195,35 185,98 80,105" fill="#4B5563" stroke="#CBD5E1" strokeWidth="1.2" />
            <polygon points="90,42 195,35 185,48 80,55" fill="#6B7280" opacity="0.6" />

            <polygon points="360,38 490,30 480,95 350,102" fill="#4B5563" stroke="#CBD5E1" strokeWidth="1.2" />
            <polygon points="360,38 490,30 480,45 350,52" fill="#6B7280" opacity="0.6" />

            <polygon points="100,200 230,192 218,275 88,282" fill="#4B5563" stroke="#CBD5E1" strokeWidth="1.2" />
            <polygon points="380,195 510,188 500,268 370,275" fill="#4B5563" stroke="#CBD5E1" strokeWidth="1.2" />

            {/* Vectorized AI Boundary Contours */}
            {showEdges && (
              <g className="ai-edges">
                <polygon points="65,25 220,15 205,115 50,125" fill="none" stroke="#F59E0B" strokeWidth="1.8" strokeDasharray="4,2" />
                <rect x="190" y="10" width="38" height="18" rx="4" fill="#F59E0B" />
                <text x="209" y="23" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">98.4%</text>

                <polygon points="330,20 520,10 505,110 320,120" fill="none" stroke="#F59E0B" strokeWidth="1.8" strokeDasharray="4,2" />
                <rect x="490" y="8" width="38" height="18" rx="4" fill="#F59E0B" />
                <text x="509" y="21" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">96.1%</text>

                <polygon points="60,180 250,170 235,295 45,305" fill="none" stroke="#F59E0B" strokeWidth="1.8" strokeDasharray="4,2" />
                <rect x="220" y="165" width="38" height="18" rx="4" fill="#F59E0B" />
                <text x="239" y="178" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">97.8%</text>
              </g>
            )}

            {/* 3D Heights from DSM/DTM */}
            {showHeights && (
              <g className="ai-height-tags">
                <g transform="translate(130, 75)">
                  <rect x="-26" y="-10" width="52" height="18" rx="3" fill="#7C3AED" />
                  <text x="0" y="3" fill="#fff" fontSize="9.5" fontWeight="bold" textAnchor="middle">G+2 • 9.8m</text>
                </g>
                <g transform="translate(415, 70)">
                  <rect x="-26" y="-10" width="52" height="18" rx="3" fill="#7C3AED" />
                  <text x="0" y="3" fill="#fff" fontSize="9.5" fontWeight="bold" textAnchor="middle">G+3 • 13.5m</text>
                </g>
                <g transform="translate(155, 240)">
                  <rect x="-26" y="-10" width="52" height="18" rx="3" fill="#7C3AED" />
                  <text x="0" y="3" fill="#fff" fontSize="9.5" fontWeight="bold" textAnchor="middle">G+1 • 6.4m</text>
                </g>
                <g transform="translate(435, 235)">
                  <rect x="-26" y="-10" width="52" height="18" rx="3" fill="#7C3AED" />
                  <text x="0" y="3" fill="#fff" fontSize="9.5" fontWeight="bold" textAnchor="middle">G+4 • 16.2m</text>
                </g>
              </g>
            )}
          </svg>
        </div>

        <div className="topo-footer">
          <div className="topo-stats">
            <div className="stat-pill"><strong>Architecture:</strong> {modelType === "sam" ? "ViT-H SAM-Geo" : "YOLOv8x-OBB"}</div>
            <div className="stat-pill"><strong>Ground Sampling:</strong> 5.0 cm / pixel</div>
            <div className="stat-pill"><strong>Rooftop IoU:</strong> 0.961</div>
            <div className="stat-pill"><strong>Inference Time:</strong> 18ms / tile</div>
          </div>
          <button className="btn-modern btn-primary" onClick={onClose}>Close Inspector</button>
        </div>
      </div>
    </div>
  );
}
