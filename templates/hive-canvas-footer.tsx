// Hive Canvas Footer - React component for interactive canvas rendering
// __VAULT_ROOT__ is replaced at generation time with the configured vault path.
const VAULT_ROOT = "__VAULT_ROOT__";

export default function HiveCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const groupColors = useMemo(() => {
    const colors: Record<string, string> = {
      core: "#6366f1",
      agent: "#22c55e",
      domain: "#f59e0b",
      skill: "#ec4899",
      reference: "#64748b",
      concept: "#06b6d4",
    };
    return colors;
  }, []);

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.1, Math.min(5, z * delta)));
  };

  const handleMouseDown = (e: MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseUp = () => setDragging(false);

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const nodes = hiveData.nodes ?? [];
  const links = hiveData.links ?? [];

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100vh", overflow: "hidden", background: "#0f172a", position: "relative" }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
    >
      <svg style={{ width: "100%", height: "100%", transform: `translate(${offset.x}px,${offset.y}px) scale(${zoom})` }}>
        {links.map((link: any, i: number) => (
          <line key={i} x1={link.source?.x ?? 0} y1={link.source?.y ?? 0} x2={link.target?.x ?? 0} y2={link.target?.y ?? 0} stroke="#334155" strokeWidth={1} />
        ))}
        {nodes.map((node: any) => (
          <g key={node.id} transform={`translate(${node.x ?? 0},${node.y ?? 0})`} onClick={() => setSelectedNode(node.id)}>
            <circle r={20} fill={groupColors[node.group] ?? "#64748b"} opacity={0.85} />
            <text textAnchor="middle" dy={35} fill="#e2e8f0" fontSize={11}>{node.label ?? node.id}</text>
          </g>
        ))}
      </svg>
      {selectedNode && (
        <div style={{ position: "absolute", bottom: 16, left: 16, background: "#1e293b", padding: 12, borderRadius: 8, color: "#e2e8f0", maxWidth: 320 }}>
          <strong>{selectedNode}</strong>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
            <a href={`vscode://file/${VAULT_ROOT}/${selectedNode}.md`} style={{ color: "#6366f1" }}>Open in editor</a>
          </p>
        </div>
      )}
    </div>
  );
}
