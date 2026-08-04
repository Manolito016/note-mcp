import { readdir, readFile } from "node:fs/promises";
import { resolveVaultPath, pathExists, getVaultRoot } from "../utils/vault.js";
import { extractLinks } from "../utils/links.js";
import { extractTags } from "../utils/frontmatter.js";
import * as z from "zod";

export const name = "get_graph";
export const description = "Build a knowledge graph of all notes. Returns nodes (notes with tags) and edges (links between notes). Useful for visualization.";
export const inputSchema = z.object({
    path: z.string().default(".").describe("Directory to scan, relative to the vault root (default: root)"),
    includeTags: z.boolean().default(true).describe("Include tags in node metadata (default: true)"),
});

interface GraphNode {
    id: string;
    path: string;
    tags: string[];
}

interface GraphEdge {
    from: string;
    to: string;
    type: "wiki" | "markdown";
}

export async function handler({ path, includeTags }: { path: string; includeTags: boolean }) {
    const dirPath = resolveVaultPath(path);

    if (!(await pathExists(dirPath))) {
        return { content: [{ type: "text" as const, text: `Error: Directory not found at "${path}".` }], isError: true };
    }

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();

    async function scanDir(dir: string) {
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
            if (item.name === ".trash") continue;
            const fullPath = `${dir}/${item.name}`;
            if (item.isDirectory()) {
                await scanDir(fullPath);
            } else if (item.name.endsWith(".md")) {
                try {
                    const content = await readFile(fullPath, "utf-8");
                    const relPath = fullPath.startsWith(getVaultRoot())
                        ? fullPath.slice(getVaultRoot().length + 1)
                        : fullPath;

                    // Create node ID from filename without extension
                    const nodeId = relPath.replace(/\.md$/, "").replace(/\\/g, "/");
                    const tags = includeTags ? extractTags(content) : [];

                    const node: GraphNode = { id: nodeId, path: relPath, tags };
                    nodes.push(node);
                    nodeMap.set(nodeId, node);

                    // Extract links and create edges
                    const links = extractLinks(content);

                    for (const target of links.wiki) {
                        edges.push({ from: nodeId, to: target, type: "wiki" });
                    }

                    for (const mdLink of links.markdown) {
                        const target = mdLink.target.replace(/\.md$/, "").replace(/#.*$/, "");
                        edges.push({ from: nodeId, to: target, type: "markdown" });
                    }
                } catch {
                    // Skip unreadable files
                }
            }
        }
    }

    await scanDir(dirPath);

    if (nodes.length === 0) {
        return { content: [{ type: "text" as const, text: `No notes found in "${path}".` }] };
    }

    // Build the graph output
    const graph = {
        nodes: nodes.map((n) => ({
            id: n.id,
            path: n.path,
            ...(includeTags && n.tags.length > 0 ? { tags: n.tags } : {}),
        })),
        edges: edges.map((e) => ({
            from: e.from,
            to: e.to,
            type: e.type,
        })),
        summary: {
            totalNodes: nodes.length,
            totalEdges: edges.length,
            wikiLinks: edges.filter((e) => e.type === "wiki").length,
            markdownLinks: edges.filter((e) => e.type === "markdown").length,
        },
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }] };
}
