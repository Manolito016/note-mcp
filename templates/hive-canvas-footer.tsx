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

    // Compute force-directed layout
    const layoutNodes = useMemo(() => {
        const nodes = hiveData.nodes ?? [];
        const links = hiveData.links ?? [];

        // Initialize positions in a circle
        const positions: Record<string, { x: number; y: number; vx: number; vy: number }> = {};
        const radius = Math.max(300, nodes.length * 2);
        nodes.forEach((node: any, i: number) => {
            const angle = (i / nodes.length) * Math.PI * 2;
            positions[node.id] = {
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius,
                vx: 0,
                vy: 0,
            };
        });

        // Simple force-directed simulation
        const iterations = 50;
        const repulsion = 5000;
        const attraction = 0.01;
        const damping = 0.9;

        for (let iter = 0; iter < iterations; iter++) {
            // Repulsion between all nodes
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const a = positions[nodes[i].id];
                    const b = positions[nodes[j].id];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
                    const force = repulsion / (dist * dist);
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    a.vx -= fx;
                    a.vy -= fy;
                    b.vx += fx;
                    b.vy += fy;
                }
            }

            // Attraction along links
            for (const link of links) {
                const source = positions[link.source];
                const target = positions[link.target];
                if (!source || !target) continue;
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
                const force = dist * attraction;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                source.vx += fx;
                source.vy += fy;
                target.vx -= fx;
                target.vy -= fy;
            }

            // Update positions
            for (const node of nodes) {
                const pos = positions[node.id];
                pos.vx *= damping;
                pos.vy *= damping;
                pos.x += pos.vx;
                pos.y += pos.vy;
            }
        }

        return positions;
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
            <svg
                style={{
                    width: "100%",
                    height: "100%",
                    transform: `translate(${offset.x + 800}px,${offset.y + 450}px) scale(${zoom})`,
                }}
            >
                {links.map((link: any, i: number) => {
                    const source = layoutNodes[link.source];
                    const target = layoutNodes[link.target];
                    if (!source || !target) return null;
                    return (
                        <line
                            key={i}
                            x1={source.x}
                            y1={source.y}
                            x2={target.x}
                            y2={target.y}
                            stroke="#334155"
                            strokeWidth={1}
                        />
                    );
                })}
                {nodes.map((node: any) => {
                    const pos = layoutNodes[node.id];
                    if (!pos) return null;
                    return (
                        <g
                            key={node.id}
                            transform={`translate(${pos.x},${pos.y})`}
                            onClick={() => setSelectedNode(node.id)}
                            style={{ cursor: "pointer" }}
                        >
                            <circle
                                r={node.kind === "core" ? 30 : node.kind === "agent" ? 25 : 20}
                                fill={groupColors[node.kind] ?? "#64748b"}
                                opacity={0.85}
                            />
                            <text textAnchor="middle" dy={35} fill="#e2e8f0" fontSize={11}>
                                {node.label ?? node.id}
                            </text>
                        </g>
                    );
                })}
            </svg>
            {selectedNode && (
                <div
                    style={{
                        position: "absolute",
                        bottom: 16,
                        left: 16,
                        background: "#1e293b",
                        padding: 12,
                        borderRadius: 8,
                        color: "#e2e8f0",
                        maxWidth: 320,
                    }}
                >
                    <strong>{selectedNode}</strong>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
                        <a href={`vscode://file/${VAULT_ROOT}/${selectedNode}.md`} style={{ color: "#6366f1" }}>
                            Open in editor
                        </a>
                    </p>
                </div>
            )}
        </div>
    );
}
