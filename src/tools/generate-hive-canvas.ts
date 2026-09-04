import { resolveVaultPath, pathExists, getVaultRoot, safeWriteTarget } from "../utils/vault.js";
import { scanVaultNotes, VaultNode, VaultEdge } from "../utils/graph.js";
import { parseFrontmatter } from "../utils/frontmatter.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod";

export const name = "generate_hive_canvas";
export const description =
    "Generate hive.canvas.json from the vault knowledge graph. Classifies notes into core/agent/domain/skill/reference/concept nodes, extracts frontmatter metadata, and writes a canvas-ready JSON file.";

export const inputSchema = z.object({
    output_path: z
        .string()
        .default("canvases/hive.canvas.json")
        .describe("Output path for the canvas JSON, relative to vault root (default: canvases/hive.canvas.json)"),
    scan_path: z
        .string()
        .default("plugin,knowledge")
        .describe("Comma-separated directories to scan, relative to vault root (default: plugin,knowledge)"),
    include_references: z
        .boolean()
        .default(false)
        .describe(
            "Include deep reference nodes (default: false). These are sub-topic notes inside skill reference folders.",
        ),
});

/* ── colour palette for groups ─────────────────────────────────── */

const PALETTE = [
    "#38bdf8",
    "#34d399",
    "#fb7185",
    "#fbbf24",
    "#818cf8",
    "#f472b6",
    "#2dd4bf",
    "#fb923c",
    "#a3e635",
    "#60a5fa",
    "#c084fc",
    "#4ade80",
    "#f87171",
    "#facc15",
    "#22d3ee",
    "#e879f9",
    "#a78bfa",
    "#38bdf8",
    "#f97316",
    "#14b8a6",
    "#6366f1",
    "#ec4899",
    "#84cc16",
    "#06b6d4",
    "#ef4444",
    "#8b5cf6",
    "#10b981",
    "#f59e0b",
];

function colorForIndex(index: number): string {
    return PALETTE[index % PALETTE.length];
}

/* ── types ─────────────────────────────────────────────────────── */

interface CanvasNode {
    id: string;
    label: string;
    short: string;
    kind: "core" | "agent" | "domain" | "skill" | "reference" | "concept";
    group: string;
    path: string;
    description: string;
    triggers?: string[];
}

interface CanvasLink {
    source: string;
    target: string;
    type: string;
}

interface CanvasData {
    title: string;
    subtitle: string;
    schemaVersion: number;
    groups: { id: string; label: string; color: string }[];
    nodes: CanvasNode[];
    links: CanvasLink[];
    stats: { nodes: number; edges: number; warnings: number };
}

/* ── agent definitions ─────────────────────────────────────────── */

const AGENT_MAP: Record<string, { label: string; short: string; path: string; description: string }> = {
    "prime-problem": {
        label: "Problem",
        short: "P",
        path: "plugin/prime-orchestrator/prime-problem-ideate.md",
        description: "Discover and frame the problem",
    },
    "prime-requirement": {
        label: "Requirement",
        short: "R",
        path: "plugin/prime-orchestrator/prime-requirement-architect.md",
        description: "Turn intent into constraints",
    },
    "prime-instruct": {
        label: "Instruct",
        short: "I",
        path: "plugin/prime-orchestrator/prime-instruct-spec.md",
        description: "Plan implementation and verification",
    },
    "prime-make": {
        label: "Make",
        short: "M",
        path: "plugin/prime-orchestrator/prime-make-build.md",
        description: "Build with domain skills",
    },
    "prime-evaluate": {
        label: "Evaluate",
        short: "E",
        path: "plugin/prime-orchestrator/prime-evaluate-test.md",
        description: "Test, review, and learn",
    },
};

/* ── string helpers ────────────────────────────────────────────── */

function shortName(name: string): string {
    const parts = name.split(/[-_]/);
    if (parts.length === 1) return name.slice(0, 2).toUpperCase();
    return parts
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2);
}

function titleCase(slug: string): string {
    return slug
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

/* ── metadata extraction ───────────────────────────────────────── */

async function readNoteMetadata(notePath: string): Promise<{ description: string; triggers: string[] }> {
    try {
        const fullPath = `${getVaultRoot()}/${notePath}`;
        const content = await readFile(fullPath, "utf-8");
        const { frontmatter, content: body } = parseFrontmatter(content);

        const description = (frontmatter.description as string) ?? extractFirstParagraph(body);
        const triggers = Array.isArray(frontmatter.triggers) ? (frontmatter.triggers as unknown[]).map(String) : [];

        return { description, triggers };
    } catch {
        return { description: "", triggers: [] };
    }
}

function extractFirstParagraph(content: string): string {
    const lines = content.split("\n");
    let foundText = false;
    const paragraphs: string[] = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            if (foundText) break;
            continue;
        }
        if (trimmed.startsWith("#")) continue;
        if (trimmed.startsWith("|") || trimmed.startsWith("- ") || trimmed.startsWith("```")) continue;
        foundText = true;
        paragraphs.push(trimmed);
    }
    return paragraphs.join(" ").slice(0, 300);
}

/* ── classification ────────────────────────────────────────────── */

function classifyNote(
    noteId: string,
    _notePath: string,
    skillDirectories: Set<string>,
): { kind: CanvasNode["kind"]; group: string; skillName: string } | null {
    // Core: HIVE-MIND.md
    if (noteId === "plugin/HIVE-MIND") {
        return { kind: "core", group: "core", skillName: "hive-mind" };
    }

    // Skip agent definition files (agents are hardcoded)
    if (noteId.startsWith("plugin/prime-orchestrator/prime-")) {
        return null;
    }

    // Must be under plugin/ or knowledge/
    if (!noteId.startsWith("plugin/") && !noteId.startsWith("knowledge/")) return null;

    // Knowledge directory notes
    if (noteId.startsWith("knowledge/")) {
        const fileName = noteId.split("/").pop() ?? noteId;
        return { kind: "reference" as const, group: "knowledge", skillName: fileName };
    }

    const parts = noteId.split("/");
    if (parts.length < 2) return null;

    const skillDir = parts[1];
    skillDirectories.add(skillDir);

    const fileName = parts[parts.length - 1];
    const isReference = parts.some((p) => p.endsWith("-references"));

    if (isReference) {
        return { kind: "reference", group: skillDir, skillName: fileName };
    }

    // Domain node: the main skill file (same name as directory)
    if (fileName === skillDir) {
        return { kind: "domain", group: skillDir, skillName: skillDir };
    }

    // Skill node
    return { kind: "skill", group: skillDir, skillName: fileName };
}

/* ── edge classification helper ────────────────────────────────── */

interface EdgeNodeClass {
    kind: "core" | "agent" | "domain" | "skill" | "reference" | "concept";
    group: string;
    skillName: string;
}

function classifyEdgeNode(
    edgeTarget: string,
    nodes: { id: string; path: string }[],
    skillDirectories: Set<string>,
): EdgeNodeClass | null {
    const exactNode = nodes.find((n) => n.id === edgeTarget);
    if (exactNode) {
        const result = classifyNote(exactNode.id, exactNode.path, skillDirectories);
        if (result) return result;
    }

    const prefixNode = nodes.find((n) => n.id.startsWith(edgeTarget));
    if (prefixNode) {
        const result = classifyNote(prefixNode.id, prefixNode.path, skillDirectories);
        if (result) return result;
    }

    if (edgeTarget && !edgeTarget.startsWith(".") && !edgeTarget.startsWith("http") && !edgeTarget.startsWith("#")) {
        const name = edgeTarget.split("/").pop() ?? edgeTarget;
        return { kind: "concept", group: "concept", skillName: name };
    }

    return null;
}

/* ── core generation (exported for auto-regen) ───────────────── */

export async function generateCanvas(
    outputPath = "canvases/hive.canvas.json",
    scanPath = "plugin,knowledge",
    includeReferences = false,
): Promise<{ nodes: number; links: number; warnings: number; groups: number }> {
    // Support scanning multiple directories
    const scanPaths = scanPath
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    let allNodes: VaultNode[] = [];
    let allEdges: VaultEdge[] = [];

    for (const sp of scanPaths) {
        const scanDir = resolveVaultPath(sp);
        if (!(await pathExists(scanDir))) continue;
        const { nodes, edges } = await scanVaultNotes(scanDir);
        allNodes = allNodes.concat(nodes);
        allEdges = allEdges.concat(edges);
    }

    if (allNodes.length === 0) {
        return { nodes: 0, links: 0, warnings: 0, groups: 0 };
    }

    // 2. Classify nodes
    const skillDirectories = new Set<string>();
    const canvasNodes: CanvasNode[] = [];
    const nodeIds = new Set<string>();
    let warnings = 0;
    const nodes = allNodes;
    const edges = allEdges;

    // Core node
    const hiveNode = nodes.find((n) => n.id === "plugin/HIVE-MIND");
    if (hiveNode) {
        canvasNodes.push({
            id: "hive",
            label: "HIVE MIND",
            short: "H",
            kind: "core",
            group: "core",
            path: hiveNode.path,
            description: "Shared graph memory and routing hub",
        });
        nodeIds.add("hive");
    }

    // Agent nodes
    for (const [agentKey, info] of Object.entries(AGENT_MAP)) {
        const agentId = `agent:${agentKey.replace("prime-", "")}`;
        canvasNodes.push({
            id: agentId,
            label: info.label,
            short: info.short,
            kind: "agent",
            group: "prime",
            path: info.path,
            description: info.description,
        });
        nodeIds.add(agentId);
    }

    // Classify all plugin notes
    for (const node of nodes) {
        const classification = classifyNote(node.id, node.path, skillDirectories);
        if (!classification) continue;

        const { kind, group, skillName } = classification;
        if (kind === "reference" && !includeReferences) continue;

        const nodeId = kind === "domain" ? `domain:${group}` : `${kind}:${skillName}`;
        if (nodeIds.has(nodeId)) continue;
        nodeIds.add(nodeId);

        const { description, triggers } = await readNoteMetadata(node.path);

        const canvasNode: CanvasNode = {
            id: nodeId,
            label: titleCase(skillName),
            short: shortName(skillName),
            kind,
            group,
            path: node.path,
            description,
        };
        if (triggers.length > 0) {
            canvasNode.triggers = triggers;
        }
        canvasNodes.push(canvasNode);
    }

    // Concept nodes: unresolved edge targets
    for (const edge of edges) {
        const target = edge.to;
        const matchesNode = nodes.some((n) => n.id === target || n.id.startsWith(target));
        if (!matchesNode && target && !target.startsWith(".") && !target.startsWith("http")) {
            const conceptId = `concept:${target.split("/").pop() ?? target}`;
            if (!nodeIds.has(conceptId)) {
                nodeIds.add(conceptId);
                canvasNodes.push({
                    id: conceptId,
                    label: titleCase(target.split("/").pop() ?? target),
                    short: "?",
                    kind: "concept",
                    group: "concept",
                    path: "",
                    description: "Relationship target without a matching routable skill",
                });
                warnings++;
            }
        }
    }

    // 3. Build groups
    const groups: { id: string; label: string; color: string }[] = [
        { id: "core", label: "Collective memory", color: "#a78bfa" },
        { id: "prime", label: "P.R.I.M.E. lifecycle", color: "#c084fc" },
    ];
    let colorIndex = 0;
    for (const dir of [...skillDirectories].sort()) {
        groups.push({ id: dir, label: titleCase(dir), color: colorForIndex(colorIndex++) });
    }
    groups.push({ id: "knowledge", label: "Knowledge", color: "#22d3ee" });
    groups.push({ id: "concept", label: "Concepts & aliases", color: "#94a3b8" });

    // 4. Build links
    const canvasLinks: CanvasLink[] = [];

    // Hub → agents
    for (const agentKey of Object.keys(AGENT_MAP)) {
        canvasLinks.push({ source: "hive", target: `agent:${agentKey.replace("prime-", "")}`, type: "knowledge" });
    }

    // Agent lifecycle chain
    const agentOrder = ["problem", "requirement", "instruct", "make", "evaluate"];
    for (let i = 0; i < agentOrder.length - 1; i++) {
        canvasLinks.push({ source: `agent:${agentOrder[i]}`, target: `agent:${agentOrder[i + 1]}`, type: "lifecycle" });
    }
    canvasLinks.push({ source: "agent:evaluate", target: "agent:problem", type: "feedback" });

    // Hub → domains
    for (const dir of [...skillDirectories].sort()) {
        canvasLinks.push({ source: "hive", target: `domain:${dir}`, type: "knowledge" });
    }

    // Edge-based links
    for (const edge of edges) {
        const sourceClass = classifyEdgeNode(edge.from, nodes, skillDirectories);
        const targetClass = classifyEdgeNode(edge.to, nodes, skillDirectories);
        if (!sourceClass || !targetClass) continue;

        if (sourceClass.kind === "domain" && targetClass.kind === "skill" && sourceClass.group === targetClass.group) {
            canvasLinks.push({
                source: `domain:${sourceClass.group}`,
                target: `skill:${targetClass.skillName}`,
                type: "skill",
            });
        } else if (
            sourceClass.kind === "domain" &&
            targetClass.kind === "reference" &&
            sourceClass.group === targetClass.group &&
            includeReferences
        ) {
            canvasLinks.push({
                source: `domain:${sourceClass.group}`,
                target: `reference:${targetClass.skillName}`,
                type: "skill",
            });
        } else if (
            sourceClass.kind === "skill" &&
            targetClass.kind === "skill" &&
            sourceClass.group !== targetClass.group
        ) {
            canvasLinks.push({
                source: `skill:${sourceClass.skillName}`,
                target: `skill:${targetClass.skillName}`,
                type: "bridge",
            });
        } else if (
            sourceClass.kind === "skill" &&
            targetClass.kind === "reference" &&
            sourceClass.group === targetClass.group &&
            includeReferences
        ) {
            canvasLinks.push({
                source: `skill:${sourceClass.skillName}`,
                target: `reference:${targetClass.skillName}`,
                type: "skill",
            });
        } else if (targetClass.kind === "concept") {
            const sourceId =
                sourceClass.kind === "domain"
                    ? `domain:${sourceClass.group}`
                    : `${sourceClass.kind}:${sourceClass.skillName}`;
            canvasLinks.push({ source: sourceId, target: `concept:${targetClass.skillName}`, type: "bridge" });
        }
    }

    // Deduplicate
    const linkSet = new Set<string>();
    const uniqueLinks = canvasLinks.filter((link) => {
        const key = `${link.source}|${link.target}|${link.type}`;
        if (linkSet.has(key)) return false;
        linkSet.add(key);
        return true;
    });

    // 5. Assemble
    const canvasData: CanvasData = {
        title: "Plugin Hive Mind",
        subtitle: "An interactive map of the plugin knowledge graph",
        schemaVersion: 2,
        groups,
        nodes: canvasNodes,
        links: uniqueLinks,
        stats: { nodes: canvasNodes.length, edges: uniqueLinks.length, warnings },
    };

    // 6. Write output (validated via centralized safety helper)
    const resolvedOutputPath = await safeWriteTarget(outputPath);
    await mkdir(dirname(resolvedOutputPath), { recursive: true });
    await writeFile(resolvedOutputPath, JSON.stringify(canvasData, null, 2), "utf-8");

    // Also write TSX if template is available
    // Privacy note: The generated TSX embeds the configured vault path to enable
    // "Open in IDE" (vscode://file/) links. This is required for the feature to work.
    // The TSX is only generated inside the vault, never transmitted externally.
    try {
        const tsxPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "templates", "hive-canvas-footer.tsx");
        const template = await readFile(tsxPath, "utf-8");
        const vaultRoot = getVaultRoot().replace(/\\/g, "/");
        // Replace any hardcoded VAULT_ROOT placeholder with the configured vault path
        const tsxContent = `"use client";\n\nimport { useMemo, useRef, useState } from "react";\nimport type { MouseEvent as ReactMouseEvent, WheelEvent } from "react";\nimport { ReportShell } from "qoder/canvas";\nconst hiveData = ${JSON.stringify(canvasData, null, 4)};\n${template.replace(/__VAULT_ROOT__/, vaultRoot)}`;
        // Derive TSX output path and validate it independently
        const tsxOutputPath = resolvedOutputPath.replace(/\.json$/, ".tsx");
        // Ensure TSX path is different from JSON path (no collision)
        if (tsxOutputPath === resolvedOutputPath) {
            // Output path doesn't end with .json — skip TSX to avoid collision
            return { nodes: canvasNodes.length, links: uniqueLinks.length, warnings, groups: groups.length };
        }
        // Validate the derived TSX path independently via safeWriteTarget
        const vaultRootForRel = getVaultRoot();
        const { relative: relPath } = await import("node:path");
        const tsxRelPath = relPath(vaultRootForRel, tsxOutputPath).replace(/\\/g, "/");
        const validatedTsxPath = await safeWriteTarget(tsxRelPath);
        await writeFile(validatedTsxPath, tsxContent, "utf-8");
    } catch {
        // Template not found or TSX generation failed — skip silently
    }

    return { nodes: canvasNodes.length, links: uniqueLinks.length, warnings, groups: groups.length };
}

/* ── MCP handler ───────────────────────────────────────────────── */

export async function handler({
    output_path,
    scan_path,
    include_references,
}: {
    output_path: string;
    scan_path: string;
    include_references: boolean;
}) {
    try {
        const result = await generateCanvas(output_path, scan_path, include_references);
        return {
            content: [
                {
                    type: "text" as const,
                    text: `Hive canvas generated at "${output_path}": ${result.nodes} nodes, ${result.links} links, ${result.warnings} warnings. Groups: ${result.groups}.`,
                },
            ],
        };
    } catch (err) {
        return {
            content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
            isError: true,
        };
    }
}
