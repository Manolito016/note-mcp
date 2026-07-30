import { useState, useEffect, useRef, useCallback } from "react";

// Types for the graph data
interface GraphNode {
  id: string;
  path: string;
  tags?: string[];
}

interface GraphEdge {
  from: string;
  to: string;
  type: "wiki" | "markdown";
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: {
    totalNodes: number;
    totalEdges: number;
    wikiLinks: number;
    markdownLinks: number;
  };
}

// Force-directed layout simulation
interface NodePosition {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function useForceLayout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  const [positions, setPositions] = useState<NodePosition[]>([]);
  const frameRef = useRef<number>();

  useEffect(() => {
    // Initialize positions in a circle
    const initial: NodePosition[] = nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      const radius = Math.min(width, height) * 0.3;
      return {
        id: node.id,
        x: width / 2 + radius * Math.cos(angle),
        y: height / 2 + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
      };
    });

    setPositions(initial);

    // Simple force simulation
    const iterations = 100;
    let current = [...initial];

    for (let iter = 0; iter < iterations; iter++) {
      const next = current.map((p) => ({ ...p }));

      // Repulsion between all nodes
      for (let i = 0; i < next.length; i++) {
        for (let j = i + 1; j < next.length; j++) {
          const dx = next[j].x - next[i].x;
          const dy = next[j].y - next[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 5000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          next[i].vx -= fx;
          next[i].vy -= fy;
          next[j].vx += fx;
          next[j].vy += fy;
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const fromIdx = next.findIndex((p) => p.id === edge.from);
        const toIdx = next.findIndex((p) => p.id === edge.to);
        if (fromIdx === -1 || toIdx === -1) continue;

        const dx = next[toIdx].x - next[fromIdx].x;
        const dy = next[toIdx].y - next[fromIdx].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 100) * 0.01;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        next[fromIdx].vx += fx;
        next[fromIdx].vy += fy;
        next[toIdx].vx -= fx;
        next[toIdx].vy -= fy;
      }

      // Center gravity
      for (const p of next) {
        const dx = width / 2 - p.x;
        const dy = height / 2 - p.y;
        p.vx += dx * 0.001;
        p.vy += dy * 0.001;
      }

      // Apply velocity with damping
      for (const p of next) {
        p.x += p.vx * 0.1;
        p.y += p.vy * 0.1;
        p.vx *= 0.9;
        p.vy *= 0.9;

        // Keep within bounds
        p.x = Math.max(50, Math.min(width - 50, p.x));
        p.y = Math.max(50, Math.min(height - 50, p.y));
      }

      current = next;
    }

    setPositions(current);
  }, [nodes, edges, width, height]);

  return positions;
}

// Real vault data from D:\vault (scanned 2026-07-24)
// Edges are computed from shared tags (2+ shared tags = connection)
const rawNodes: GraphNode[] = [
  { id: "knowledge/prime-method-lifecycle", path: "knowledge/prime-method-lifecycle.md", tags: ["prime-method", "project-lifecycle", "orchestration"] },
  { id: "knowledge/sogo-prime-lessons", path: "knowledge/sogo-prime-lessons.md", tags: ["sogo", "prime", "lessons-learned"] },
  { id: "decisions/sogo-video-stream-from-oss", path: "decisions/sogo-video-stream-from-oss.md", tags: ["oss", "streaming", "video-audit", "sogo-video"] },
  { id: "decisions/multi-zone-roi-detect-types", path: "decisions/multi-zone-roi-detect-types.md", tags: ["roi", "detection", "classification"] },
  { id: "decisions/storage-paths-to-project-folder", path: "decisions/storage-paths-to-project-folder.md", tags: ["storage", "flash-drive"] },
  { id: "decisions/prime-method-vault-integration", path: "decisions/prime-method-vault-integration.md", tags: ["prime-method", "vault", "notes-mcp"] },
  { id: "projects/sogo-clip-uploader-architecture", path: "projects/sogo-clip-uploader-architecture.md", tags: ["sogo", "oss", "video-processing"] },
  { id: "projects/sogo-video/roi-feature", path: "projects/sogo-video/roi-feature.md", tags: ["roi", "detection", "canvas", "yolo"] },
  { id: "projects/sogo-video/spatial-detection-classification", path: "projects/sogo-video/spatial-detection-classification.md", tags: ["classification", "roi", "detection", "yolo"] },
  { id: "projects/sogo-video/live-video-bounding-box-overlay", path: "projects/sogo-video/live-video-bounding-box-overlay.md", tags: ["bounding-box", "canvas", "websocket", "yolo"] },
  { id: "projects/prime-method/hackathon-prime-installation", path: "projects/prime-method/hackathon-prime-installation.md", tags: ["prime-method", "plugin-installation"] },
  { id: "projects/prime-method/plugin-consolidation-update", path: "projects/prime-method/plugin-consolidation-update.md", tags: ["prime-method", "plugin-update"] },
  { id: "projects/prime-method/merge-v5.1.0", path: "projects/prime-method/merge-v5.1.0.md", tags: [] },
  { id: "projects/prime-method/unified-pipeline-v6", path: "projects/prime-method/unified-pipeline-v6.md", tags: [] },
  { id: "projects/sogo/prime-lifecycle", path: "projects/sogo/prime-lifecycle.md", tags: ["sogo", "prime", "architecture"] },
  { id: "projects/sogo/prime-full-lifecycle", path: "projects/sogo/prime-full-lifecycle.md", tags: ["prime", "sogo", "lifecycle"] },
  { id: "projects/sogo/per-branch-processing-config", path: "projects/sogo/per-branch-processing-config.md", tags: ["detection-filter", "sogo"] },
  { id: "projects/sogo/transaction-clip-extractor", path: "projects/sogo/transaction-clip-extractor.md", tags: ["oss", "ffmpeg", "video-processing", "sogo"] },
  { id: "solutions/sogo-video-dashboard-bugs", path: "solutions/sogo-video-dashboard-bugs.md", tags: [] },
  { id: "solutions/skip-already-audited-videos", path: "solutions/skip-already-audited-videos.md", tags: ["audit", "performance"] },
  { id: "solutions/batch-audit-concurrency-retry", path: "solutions/batch-audit-concurrency-retry.md", tags: ["oss", "yolo", "concurrency", "sogo-video"] },
  { id: "solutions/pytorch-cuda-installation", path: "solutions/pytorch-cuda-installation.md", tags: ["pytorch", "cuda", "yolo", "gpu"] },
  { id: "solutions/bcrypt-passlib-incompatibility", path: "solutions/bcrypt-passlib-incompatibility.md", tags: ["python", "authentication"] },
  { id: "solutions/roi-canvas-frame-display-bug", path: "solutions/roi-canvas-frame-display-bug.md", tags: ["roi", "canvas", "bug-fix"] },
  { id: "solutions/mcp-server-pipe-crash", path: "solutions/mcp-server-pipe-crash.md", tags: ["mcp", "crash", "keepalive"] },
  { id: "solutions/roi-config-driven-detection-logic", path: "solutions/roi-config-driven-detection-logic.md", tags: ["roi", "detection-logic"] },
  { id: "solutions/stop-button-not-responding-during-video-analysis", path: "solutions/stop-button-not-responding-during-video-analysis.md", tags: ["websocket", "live-monitor", "bug-fix"] },
  { id: "solutions/video-status-stuck-at-downloading", path: "solutions/video-status-stuck-at-downloading.md", tags: ["websocket", "live-monitor"] },
  { id: "solutions/stale-audit-job-blocks-restart", path: "solutions/stale-audit-job-blocks-restart.md", tags: ["audit", "concurrency", "bug-fix"] },
  { id: "solutions/websocket-state-loss-on-page-refresh", path: "solutions/websocket-state-loss-on-page-refresh.md", tags: ["websocket", "reconnect"] },
  { id: "solutions/bounding-box-roi-overlay-audit-detail-live-monitor", path: "solutions/bounding-box-roi-overlay-audit-detail-live-monitor.md", tags: ["bounding-box", "roi", "canvas", "live-monitor"] },
  { id: "solutions/roi-filter-cards-only-constrained", path: "solutions/roi-filter-cards-only-constrained.md", tags: ["roi", "bounding-box"] },
  { id: "solutions/live-audit-preview-frame-streaming", path: "solutions/live-audit-preview-frame-streaming.md", tags: ["websocket", "yolo", "bounding-box"] },
  { id: "solutions/oss-archive-hevc-clip-extraction", path: "solutions/oss-archive-hevc-clip-extraction.md", tags: ["oss", "ffmpeg", "video-processing"] },
];

// Compute edges: connect nodes that share 2+ tags
function computeEdges(nodes: GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const tagsA = new Set(nodes[i].tags || []);
      const tagsB = new Set(nodes[j].tags || []);
      const shared = [...tagsA].filter((t) => tagsB.has(t));
      if (shared.length >= 2) {
        edges.push({ from: nodes[i].id, to: nodes[j].id, type: "wiki" });
      }
    }
  }
  return edges;
}

const computedEdges = computeEdges(rawNodes);
const sampleGraphData: GraphData = {
  nodes: rawNodes,
  edges: computedEdges,
  summary: { totalNodes: rawNodes.length, totalEdges: computedEdges.length, wikiLinks: computedEdges.length, markdownLinks: 0 },
};

// Tag colors (mapped to vault tags)
const tagColors: Record<string, string> = {
  // Folders
  knowledge: "#3b82f6",
  decisions: "#f59e0b",
  projects: "#22c55e",
  solutions: "#ef4444",
  // Topics
  sogo: "#8b5cf6",
  prime: "#6366f1",
  "prime-method": "#6366f1",
  roi: "#ec4899",
  detection: "#f97316",
  yolo: "#14b8a6",
  websocket: "#06b6d4",
  oss: "#a855f7",
  canvas: "#f43f5e",
  "bug-fix": "#ef4444",
  "live-monitor": "#22d3ee",
  "bounding-box": "#fb923c",
  "video-processing": "#4ade80",
  "video-audit": "#34d399",
  ffmpeg: "#a3e635",
  mcp: "#818cf8",
  audit: "#fbbf24",
  concurrency: "#fb7185",
  architecture: "#f59e0b",
  python: "#3b82f6",
  pytorch: "#f97316",
};

function getTagColor(tag: string): string {
  return tagColors[tag] || "#6b7280";
}

export default function NoteGraph() {
  const [graphData] = useState<GraphData>(sampleGraphData);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  const width = 800;
  const height = 600;

  const positions = useForceLayout(graphData.nodes, graphData.edges, width, height);

  // Get all unique tags
  const allTags = Array.from(new Set(graphData.nodes.flatMap((n) => n.tags || [])));

  // Filter nodes by tag
  const filteredNodes = filterTag
    ? graphData.nodes.filter((n) => n.tags?.includes(filterTag))
    : graphData.nodes;

  const filteredPositions = positions.filter((p) =>
    filteredNodes.some((n) => n.id === p.id)
  );

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNode((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const getNodeById = (id: string) => graphData.nodes.find((n) => n.id === id);
  const getPositionById = (id: string) => filteredPositions.find((p) => p.id === id);

  const selectedNodeData = selectedNode ? getNodeById(selectedNode) : null;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "16px", background: "#0f172a", color: "#e2e8f0", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>Vault Knowledge Graph</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>
            {filteredNodes.length} nodes | {graphData.edges.length} edges
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
            style={{ padding: "4px 8px", background: "#1e293b", border: "1px solid #334155", borderRadius: "4px", color: "#e2e8f0", cursor: "pointer" }}
          >
            +
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            style={{ padding: "4px 8px", background: "#1e293b", border: "1px solid #334155", borderRadius: "4px", color: "#e2e8f0", cursor: "pointer" }}
          >
            -
          </button>
        </div>
      </div>

      {/* Tag filter */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
        <button
          onClick={() => setFilterTag(null)}
          style={{
            padding: "4px 10px",
            fontSize: "12px",
            background: filterTag === null ? "#6366f1" : "#1e293b",
            border: "1px solid #334155",
            borderRadius: "12px",
            color: "#e2e8f0",
            cursor: "pointer",
          }}
        >
          All
        </button>
        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => setFilterTag(filterTag === tag ? null : tag)}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              background: filterTag === tag ? getTagColor(tag) : "#1e293b",
              border: `1px solid ${filterTag === tag ? getTagColor(tag) : "#334155"}`,
              borderRadius: "12px",
              color: "#e2e8f0",
              cursor: "pointer",
            }}
          >
            #{tag}
          </button>
        ))}
      </div>

      {/* Graph visualization */}
      <div style={{ position: "relative", background: "#1e293b", borderRadius: "8px", overflow: "hidden" }}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 0.2s" }}
        >
          {/* Edges */}
          {graphData.edges.map((edge, i) => {
            const fromPos = getPositionById(edge.from);
            const toPos = getPositionById(edge.to);
            if (!fromPos || !toPos) return null;

            const isConnected = selectedNode === edge.from || selectedNode === edge.to;
            const opacity = selectedNode ? (isConnected ? 1 : 0.2) : 0.6;

            return (
              <line
                key={i}
                x1={fromPos.x}
                y1={fromPos.y}
                x2={toPos.x}
                y2={toPos.y}
                stroke={edge.type === "wiki" ? "#6366f1" : "#22c55e"}
                strokeWidth={isConnected ? 2 : 1}
                opacity={opacity}
                strokeDasharray={edge.type === "markdown" ? "4" : undefined}
              />
            );
          })}

          {/* Nodes */}
          {filteredPositions.map((pos) => {
            const node = getNodeById(pos.id);
            if (!node) return null;

            const isSelected = selectedNode === pos.id;
            const folder = pos.id.split("/")[0];
            const color = getTagColor(folder);

            return (
              <g
                key={pos.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => handleNodeClick(pos.id)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  r={isSelected ? 14 : 10}
                  fill={color}
                  stroke={isSelected ? "#fff" : "transparent"}
                  strokeWidth={2}
                  opacity={selectedNode && !isSelected ? 0.4 : 1}
                />
                <text
                  dy={-16}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#e2e8f0"
                  opacity={selectedNode && !isSelected ? 0.4 : 1}
                >
                  {pos.id.split("/").pop()?.slice(0, 20)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Node details panel */}
      {selectedNodeData && (
        <div style={{ marginTop: "16px", padding: "12px", background: "#1e293b", borderRadius: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "14px" }}>{selectedNodeData.id}</h3>
            <button
              onClick={() => setSelectedNode(null)}
              style={{ padding: "2px 8px", background: "#334155", border: "none", borderRadius: "4px", color: "#e2e8f0", cursor: "pointer" }}
            >
              x
            </button>
          </div>
          <p style={{ margin: "8px 0", fontSize: "12px", color: "#94a3b8" }}>{selectedNodeData.path}</p>
          {selectedNodeData.tags && selectedNodeData.tags.length > 0 && (
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
              {selectedNodeData.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "2px 8px",
                    fontSize: "11px",
                    background: getTagColor(tag),
                    borderRadius: "10px",
                    color: "#fff",
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
          <div style={{ marginTop: "12px", fontSize: "12px", color: "#94a3b8" }}>
            <div>Connections: {graphData.edges.filter((e) => e.from === selectedNode || e.to === selectedNode).length}</div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: "16px", padding: "12px", background: "#1e293b", borderRadius: "8px", fontSize: "12px" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#3b82f6" }} />
            <span>knowledge</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#f59e0b" }} />
            <span>decisions</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e" }} />
            <span>projects</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#ef4444" }} />
            <span>solutions</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "8px" }}>
            <div style={{ width: "20px", height: "2px", background: "#6366f1" }} />
            <span>shared tags (2+)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
