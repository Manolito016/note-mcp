import * as z from "zod";
import { MEMORY_TYPES } from "../utils/memory-schema.js";
import type { MemoryType } from "../utils/memory-schema.js";
import { retrieve } from "../utils/retrieval-engine.js";
import type { RetrievalResult } from "../utils/retrieval-engine.js";

export const name = "quill_retrieve";
export const description =
    "Smart retrieval of memories ranked by BM25 relevance, importance, recency, and project match. " +
    "Supports context budget modes (compact/standard/deep) for token-aware retrieval.";

export const inputSchema = z.object({
    query: z.string().optional().describe("Text query for keyword matching"),
    project: z.string().optional().describe("Project scope filter (hard filter)"),
    mode: z.enum(["compact", "standard", "deep"]).default("standard").describe("Context budget mode"),
    type: z
        .union([z.enum(MEMORY_TYPES), z.array(z.enum(MEMORY_TYPES))])
        .optional()
        .describe("Filter by memory type(s)"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    limit: z.number().optional().describe("Override mode default limit"),
    entity: z.string().optional().describe("Filter by entity name"),
    min_confidence: z.number().min(0).max(1).optional().describe("Minimum confidence threshold (0.00\u20131.00)"),
    created_after: z.string().optional().describe("Only include memories created after this ISO date"),
    created_before: z.string().optional().describe("Only include memories created before this ISO date"),
});

function formatResult(r: RetrievalResult, index: number): string {
    const lines = [
        `### ${index + 1}. ${r.memory.id}`,
        `- **Type:** ${r.memory.type} | **Status:** ${r.memory.status} | **Confidence:** ${r.memory.confidence}`,
        `- **Importance:** ${r.memory.importance} | **Score:** ${r.scores.final.toFixed(3)}`,
    ];
    if (r.memory.entity) lines.push(`- **Entity:** ${r.memory.entity}`);
    if (r.memory.tags.length > 0) lines.push(`- **Tags:** ${r.memory.tags.join(", ")}`);
    lines.push(`- **Path:** ${r.memory.filePath}`);
    lines.push("");
    lines.push(r.contentPreview.slice(0, 200));
    lines.push("");
    return lines.join("\n");
}

export async function handler(args: z.infer<typeof inputSchema>) {
    const results = await retrieve({
        query: args.query,
        project: args.project,
        mode: args.mode,
        type: args.type as MemoryType | MemoryType[] | undefined,
        tags: args.tags,
        limit: args.limit,
    });

    // Post-filter by entity, confidence, and date range
    let filtered = results;
    if (args.entity) {
        filtered = filtered.filter((r) => r.memory.entity?.toLowerCase().includes(args.entity!.toLowerCase()));
    }
    if (args.min_confidence !== undefined) {
        filtered = filtered.filter((r) => r.memory.confidence >= args.min_confidence!);
    }
    if (args.created_after) {
        filtered = filtered.filter((r) => r.memory.created >= args.created_after!);
    }
    if (args.created_before) {
        filtered = filtered.filter((r) => r.memory.created <= args.created_before!);
    }

    if (filtered.length === 0) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: `No memories found for query${args.query ? ` "${args.query}"` : ""}${args.project ? ` in project "${args.project}"` : ""}.`,
                },
            ],
        };
    }

    const header = `## Retrieval Results (${filtered.length} memories, mode: ${args.mode})\n`;
    const body = filtered.map((r, i) => formatResult(r, i)).join("\n");
    const tokenNote = `\n---\n*Estimated tokens: ~${filtered.reduce((sum, r) => sum + r.contentPreview.split(/\s+/).length, 0)}*`;

    return {
        content: [{ type: "text" as const, text: header + body + tokenNote }],
    };
}
