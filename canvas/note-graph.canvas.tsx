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

// Real vault data from D:\vault (scanned 2026-08-12)
// Edges are computed from shared tags (2+ shared tags = connection)
const rawNodes: GraphNode[] = [
  // knowledge/
  { id: "knowledge/prime-method-lifecycle", path: "knowledge/prime-method-lifecycle.md", tags: ["prime-method", "project-lifecycle", "agent-dispatch", "orchestration", "knowledge-storage"] },
  { id: "knowledge/knowledge-graph-tools-and-canvas", path: "knowledge/knowledge-graph-tools-and-canvas.md", tags: ["knowledge-graph", "mcp", "canvas", "visualization", "links", "backlinks"] },
  { id: "knowledge/website-crawler-lessons", path: "knowledge/website-crawler-lessons.md", tags: ["website-crawler", "lessons-learned", "python", "playwright", "mcp", "crawler", "skill-design"] },
  { id: "knowledge/prime-method-agent-skill-wiring", path: "knowledge/prime-method-agent-skill-wiring.md", tags: ["prime-method", "wiring", "agents", "skills", "knowledge", "orchestrator", "phase-skills"] },
  { id: "knowledge/qoder-custom-commands-guide", path: "knowledge/qoder-custom-commands-guide.md", tags: ["qoder", "commands", "slash-commands", "custom-commands", "plugin"] },
  { id: "knowledge/qoder-custom-agents-guide", path: "knowledge/qoder-custom-agents-guide.md", tags: ["qoder", "agents", "subagents", "custom-agents", "frontmatter", "tools", "mcp"] },
  { id: "knowledge/soft-delete-pattern-obsidian", path: "knowledge/soft-delete-pattern-obsidian.md", tags: ["soft-delete", "obsidian", "vault", "trash", "pattern", "notes-mcp"] },
  { id: "knowledge/e2e-tester-skill-lessons", path: "knowledge/e2e-tester-skill-lessons.md", tags: ["e2e-testing", "playwright", "browser-automation", "skill-creation", "lessons-learned"] },
  // decisions/
  { id: "decisions/sogo-video-stream-from-oss", path: "decisions/sogo-video-stream-from-oss.md", tags: ["oss", "streaming", "video-audit", "architecture-decision", "sogo-video"] },
  { id: "decisions/multi-zone-roi-detect-types", path: "decisions/multi-zone-roi-detect-types.md", tags: ["roi", "detection", "classification", "architecture", "multi-zone"] },
  { id: "decisions/storage-paths-to-project-folder", path: "decisions/storage-paths-to-project-folder.md", tags: ["storage", "paths", "flash-drive", "project-folder", "data-directory", "migration"] },
  { id: "decisions/prime-method-vault-integration", path: "decisions/prime-method-vault-integration.md", tags: ["prime-method", "vault", "notes-mcp", "knowledge-persistence", "orchestrator", "cross-project-learning"] },
  { id: "decisions/website-crawler-architecture", path: "decisions/website-crawler-architecture.md", tags: ["website-crawler", "architecture", "decisions", "adr", "python", "playwright"] },
  { id: "decisions/prime-method-vault-persistence", path: "decisions/prime-method-vault-persistence.md", tags: ["prime-method", "vault", "context-compaction", "knowledge-persistence", "notes-mcp"] },
  { id: "decisions/sogo-video-requirements", path: "decisions/sogo-video-requirements.md", tags: ["sogo-video", "requirements", "prime", "phase3", "polish"] },
  { id: "decisions/sogo-video-architecture", path: "decisions/sogo-video-architecture.md", tags: ["sogo-video", "architecture", "prime", "phase4", "polish"] },
  { id: "decisions/sogo-video-spec", path: "decisions/sogo-video-spec.md", tags: ["sogo-video", "spec", "prime", "phase6", "polish"] },
  { id: "decisions/sogo-security-audit", path: "decisions/sogo-security-audit.md", tags: ["sogo", "security", "authentication", "path-traversal", "architecture-decision"] },
  { id: "decisions/ethical-hacker-skill-architecture", path: "decisions/ethical-hacker-skill-architecture.md", tags: ["skill", "security", "architecture", "owasp"] },
  { id: "decisions/ethical-hacker-requirements-architecture", path: "decisions/ethical-hacker-requirements-architecture.md", tags: ["phase3", "phase4", "ethical-hacker", "polish", "requirements", "architecture"] },
  { id: "decisions/ethical-hacker-design-spec", path: "decisions/ethical-hacker-design-spec.md", tags: ["phase5", "phase6", "ethical-hacker", "polish", "design", "spec"] },
  // projects/
  { id: "projects/sogo-clip-uploader-architecture", path: "projects/sogo-clip-uploader-architecture.md", tags: ["sogo", "oss", "video-processing", "pipeline", "architecture"] },
  { id: "projects/notes-mcp-polish-retrospective", path: "projects/notes-mcp-polish-retrospective.md", tags: ["notes-mcp", "prime", "polish-mode", "retrospective", "soft-delete", "file-watching"] },
  { id: "projects/sogo-clip-uploader-easyocr-calibration", path: "projects/sogo-clip-uploader-easyocr-calibration.md", tags: ["sogo", "easyocr", "ocr", "ffmpeg", "oss", "calibration", "docker", "uv"] },
  { id: "projects/sogo-video/roi-feature", path: "projects/sogo-video/roi-feature.md", tags: ["roi", "polygon", "yolo", "detection", "canvas", "opencv", "branch", "mask"] },
  { id: "projects/sogo-video/spatial-detection-classification", path: "projects/sogo-video/spatial-detection-classification.md", tags: ["classification", "spatial", "roi", "detection", "video-audit", "yolo"] },
  { id: "projects/sogo-video/live-video-bounding-box-overlay", path: "projects/sogo-video/live-video-bounding-box-overlay.md", tags: ["live-monitor", "bounding-box", "canvas", "websocket", "yolo", "detection-overlay"] },
  { id: "projects/sogo-video/2026-07-28-prime-polish-retrospective", path: "projects/sogo-video/2026-07-28-prime-polish-retrospective.md", tags: ["prime", "polish", "retrospective", "sogo-video", "deployment", "quality"] },
  { id: "projects/prime-method/hackathon-prime-installation", path: "projects/prime-method/hackathon-prime-installation.md", tags: ["prime-method", "hackathon", "plugin-installation", "qoderwork", "super-skills", "mvp-framework"] },
  { id: "projects/prime-method/plugin-consolidation-update", path: "projects/prime-method/plugin-consolidation-update.md", tags: ["prime-method", "plugin-update", "consolidation", "qoder-plugins"] },
  { id: "projects/prime-method/merge-v5.1.0", path: "projects/prime-method/merge-v5.1.0.md", tags: [] },
  { id: "projects/prime-method/unified-pipeline-v6", path: "projects/prime-method/unified-pipeline-v6.md", tags: [] },
  { id: "projects/sogo/prime-lifecycle", path: "projects/sogo/prime-lifecycle.md", tags: ["sogo", "prime", "architecture", "security", "documentation"] },
  { id: "projects/sogo/prime-full-lifecycle", path: "projects/sogo/prime-full-lifecycle.md", tags: ["prime", "sogo", "lifecycle", "brownfield", "documentation", "design-system", "evaluation"] },
  { id: "projects/sogo/per-branch-processing-config", path: "projects/sogo/per-branch-processing-config.md", tags: ["branch-config", "per-branch", "processing", "modal", "detection-filter", "max-frames", "localStorage"] },
  { id: "projects/sogo/transaction-clip-extractor", path: "projects/sogo/transaction-clip-extractor.md", tags: ["transaction-clip-extractor", "oss", "ffmpeg", "csv-parsing", "video-processing", "sogo"] },
  { id: "projects/sogo/charter", path: "projects/sogo/charter.md", tags: ["sogo", "prime", "project-charter", "fastapi", "yolo", "oss", "brownfield-audit"] },
  { id: "projects/sogo-clip-uploader/web-ui-date-overlap", path: "projects/sogo-clip-uploader/web-ui-date-overlap.md", tags: ["sogo", "clip-uploader", "web-ui", "date-overlap", "stores-api"] },
  { id: "projects/sogo-clip-uploader/xlsx-transaction-source", path: "projects/sogo-clip-uploader/xlsx-transaction-source.md", tags: ["sogo-clip-uploader", "xlsx", "transactions", "pipeline", "feature"] },
  { id: "projects/sogo-clip-uploader/oss-archive-output-fixes", path: "projects/sogo-clip-uploader/oss-archive-output-fixes.md", tags: ["oss", "archive", "output-dir", "api-stores", "xlsx", "error-handling"] },
  { id: "projects/sogo-clip-uploader/segment-download-implementation", path: "projects/sogo-clip-uploader/segment-download-implementation.md", tags: ["segment-download", "oss", "bandwidth", "pipeline", "optimization"] },
  { id: "projects/sogo-clip-uploader/mp4-segment-download-fails", path: "projects/sogo-clip-uploader/mp4-segment-download-fails.md", tags: ["mp4", "moov-atom", "segment-download", "ffmpeg", "oss", "video-processing"] },
  { id: "projects/sogo-clip-uploader/http-streaming-implementation", path: "projects/sogo-clip-uploader/http-streaming-implementation.md", tags: ["http-streaming", "signed-url", "ffmpeg", "oss", "video-processing", "optimization"] },
  { id: "projects/sogo-clip-uploader/pipeline-bugs-fixed-aug5", path: "projects/sogo-clip-uploader/pipeline-bugs-fixed-aug5.md", tags: ["sogo-clip-uploader", "pipeline", "bugfix", "oss", "xlsx"] },
  { id: "projects/sogo-clip-uploader/jwt-auth-implementation", path: "projects/sogo-clip-uploader/jwt-auth-implementation.md", tags: ["auth", "jwt", "fastapi", "security", "sogo-clip-uploader"] },
  { id: "projects/sogo-clip-uploader/docker-commands", path: "projects/sogo-clip-uploader/docker-commands.md", tags: ["docker", "sogo-clip-uploader", "commands", "deployment"] },
  { id: "projects/sogo-clip-uploader/docker-volume-architecture", path: "projects/sogo-clip-uploader/docker-volume-architecture.md", tags: ["docker", "sogo-clip-uploader", "sqlite", "volume-mounts", "architecture"] },
  { id: "projects/website-crawler-skill/charter", path: "projects/website-crawler-skill/charter.md", tags: ["website-crawler", "skill", "python", "playwright", "crawler", "extraction"] },
  { id: "projects/website-crawler-skill/retrospective", path: "projects/website-crawler-skill/retrospective.md", tags: ["website-crawler", "skill", "python", "playwright", "retrospective", "mcp", "architecture"] },
  { id: "projects/website-crawler/test-results-tiaong", path: "projects/website-crawler/test-results-tiaong.md", tags: ["website-crawler", "crawl", "tiaong", "images", "httpx", "test-results"] },
  { id: "projects/certificate-pptx/certificate-generation", path: "projects/certificate-pptx/certificate-generation.md", tags: ["python", "pptx", "certificate", "bayanaIhan", "design", "powerpoint"] },
  { id: "projects/sogo-video-auditor/charter", path: "projects/sogo-video-auditor/charter.md", tags: ["sogo-video", "polish", "prime", "project-charter"] },
  { id: "projects/sogo-video-auditor/problem-analysis", path: "projects/sogo-video-auditor/problem-analysis.md", tags: ["sogo-video", "polish", "problem-analysis", "prime", "phase2"] },
  { id: "projects/notes-mcp-polish/charter", path: "projects/notes-mcp-polish/charter.md", tags: ["notes-mcp", "prime-method", "polish", "project-charter"] },
  { id: "projects/ethical-hacker-skill/charter", path: "projects/ethical-hacker-skill/charter.md", tags: ["skill", "security", "ethical-hacking", "owasp", "vulnerability", "web-security"] },
  { id: "projects/ethical-hacker-skill/phase2-problem-research", path: "projects/ethical-hacker-skill/phase2-problem-research.md", tags: ["phase2", "ethical-hacker", "polish", "research", "problem-analysis"] },
  { id: "projects/ethical-hacker-skill/phase78-implementation", path: "projects/ethical-hacker-skill/phase78-implementation.md", tags: ["phase7", "phase8", "ethical-hacker", "polish", "implementation", "build"] },
  { id: "projects/e2e-tester-skill/charter", path: "projects/e2e-tester-skill/charter.md", tags: ["e2e-testing", "playwright", "skill-creation", "browser-automation", "lightning"] },
  { id: "projects/e2e-tester-skill/retrospective", path: "projects/e2e-tester-skill/retrospective.md", tags: ["e2e-testing", "playwright", "skill-creation", "retrospective", "lightning"] },
  { id: "projects/inventory-system/charter", path: "projects/inventory-system/charter.md", tags: ["business-system", "b2b-trading", "b2c-printing", "philippines", "inventory", "accounts-receivable", "polish-mode", "tier-3"] },
  { id: "projects/inventory-system/phase-2-4-summary", path: "projects/inventory-system/phase-2-4-summary.md", tags: ["inventory-system", "phase-2-4", "architecture", "django", "react", "postgresql", "polish-mode"] },
  // solutions/
  { id: "solutions/pytorch-cuda-installation", path: "solutions/pytorch-cuda-installation.md", tags: ["pytorch", "cuda", "yolo", "gpu", "uv", "dependencies"] },
  { id: "solutions/bcrypt-passlib-incompatibility", path: "solutions/bcrypt-passlib-incompatibility.md", tags: ["python", "bcrypt", "passlib", "authentication", "compatibility"] },
  { id: "solutions/mcp-server-pipe-crash", path: "solutions/mcp-server-pipe-crash.md", tags: ["mcp", "crash", "pipe-error", "nodejs", "v22-downgrade", "resilience"] },
  { id: "solutions/exfat-native-binding-failures", path: "solutions/exfat-native-binding-failures.md", tags: ["exfat", "nodejs", "vitest", "native-bindings", "sandbox", "workaround"] },
  { id: "solutions/ethical-hacker-skill-installation-fix", path: "solutions/ethical-hacker-skill-installation-fix.md", tags: ["fix", "skill", "installation", "ethical-hacker"] },
  { id: "solutions/ethical-hacker-tool-auto-installation", path: "solutions/ethical-hacker-tool-auto-installation.md", tags: ["skill", "security", "tool-setup", "automation", "ethical-hacker"] },
  { id: "solutions/e2e-tester-skill-enhancement", path: "solutions/e2e-tester-skill-enhancement.md", tags: ["e2e-testing", "playwright", "skill-enhancement", "multi-mcp", "power-patterns"] },
  { id: "solutions/migration-v8-silent-failure", path: "solutions/migration-v8-silent-failure.md", tags: ["sqlite", "migration", "database", "schema", "bug-fix", "sogo-video-auditor"] },
  { id: "solutions/roi-import-from-sogo-oss", path: "solutions/roi-import-from-sogo-oss.md", tags: ["sogo-video-auditor", "roi", "import", "sogo-oss", "card-detection"] },
  { id: "solutions/audit-controls-in-results-modal", path: "solutions/audit-controls-in-results-modal.md", tags: ["sogo-video-auditor", "results", "audit-controls", "ui-enhancement"] },
  { id: "solutions/audit-controls-functional-backend-fix", path: "solutions/audit-controls-functional-backend-fix.md", tags: ["sogo-video-auditor", "audit-controls", "api-fix", "backend", "detection-endpoint"] },
  { id: "solutions/clip-manifest-full-detail-modal", path: "solutions/clip-manifest-full-detail-modal.md", tags: ["clip-manifest", "modal", "live-monitor", "audit-controls", "video-player", "detection-results"] },
  { id: "solutions/switch-flash-drive-to-ssd", path: "solutions/switch-flash-drive-to-ssd.md", tags: ["ssd", "clip-source", "docker", "volume-mount", "live-monitor"] },
  { id: "solutions/fcfs-audit-ordering", path: "solutions/fcfs-audit-ordering.md", tags: ["fcfs", "audit-ordering", "clip-manifest", "first-come-first-serve"] },
  { id: "solutions/transaction-csv-integration", path: "solutions/transaction-csv-integration.md", tags: ["transaction-csv", "clip-matching", "local-clips", "metadata"] },
  { id: "solutions/flex-sidebar-collapse-long-pre-lines", path: "solutions/flex-sidebar-collapse-long-pre-lines.md", tags: ["css", "flexbox", "min-width", "layout", "sidebar", "sogo-clip-uploader", "debugging"] },
  // testing/
  { id: "testing/jets-trophy-crm/e2e-report-2026-08-06", path: "testing/jets-trophy-crm/e2e-report-2026-08-06.md", tags: ["e2e", "jets-trophy-crm", "security", "full-audit", "false-positives", "lessons-learned"] },
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
  testing: "#a855f7",
  // Topics - sogo ecosystem
  sogo: "#8b5cf6",
  "sogo-video": "#7c3aed",
  "sogo-clip-uploader": "#a78bfa",
  prime: "#6366f1",
  "prime-method": "#6366f1",
  // Topics - detection & video
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
  // Topics - tools & infra
  mcp: "#818cf8",
  audit: "#fbbf24",
  concurrency: "#fb7185",
  architecture: "#f59e0b",
  python: "#3b82f6",
  pytorch: "#f97316",
  docker: "#0ea5e9",
  // Topics - skills & agents
  skill: "#d946ef",
  "e2e-testing": "#10b981",
  playwright: "#34d399",
  "website-crawler": "#06b6d4",
  "ethical-hacker": "#f43f5e",
  security: "#ef4444",
  qoder: "#6366f1",
  "notes-mcp": "#818cf8",
  // Topics - inventory system
  "inventory-system": "#22c55e",
  django: "#10b981",
  react: "#38bdf8",
  postgresql: "#3b82f6",
  // Topics - misc
  "lessons-learned": "#fbbf24",
  retrospective: "#fb923c",
  polish: "#c084fc",
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
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#a855f7" }} />
            <span>testing</span>
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
