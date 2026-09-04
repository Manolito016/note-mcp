import * as z from "zod";
import { recall } from "../utils/retrieval-engine.js";
import { MEMORY_TYPES } from "../utils/memory-schema.js";
import type { RetrievalResult } from "../utils/retrieval-engine.js";

export const name = "quill_recall";
export const description =
    "Quick recall of the most important memories for a project. " +
    "Returns top memories ranked by importance and confidence — ideal for session bootstrapping. " +
    "Supports type and tag filters.";

export const inputSchema = z.object({
    project: z.string().describe("Project to recall memories for"),
    limit: z.number().min(1).max(50).default(10).describe("Number of memories to return (default: 10)"),
    type: z.enum(MEMORY_TYPES).optional().describe("Filter to a specific memory type"),
    tags: z.array(z.string()).optional().describe("Filter by tags (memories must have at least one matching tag)"),
});

export async function handler(args: z.infer<typeof inputSchema>) {
    const results = await recall(args.project, args.limit);

    // Post-filter by type
    let filtered = results;
    if (args.type) {
        filtered = filtered.filter((r) => r.memory.type === args.type);
    }
    // Post-filter by tags
    if (args.tags && args.tags.length > 0) {
        const tagSet = new Set(args.tags.map((t) => t.toLowerCase()));
        filtered = filtered.filter((r) => r.memory.tags.some((t) => tagSet.has(t.toLowerCase())));
    }

    if (filtered.length === 0) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: `No memories found for project "${args.project}"${args.type ? ` with type ${args.type}` : ""}${args.tags ? ` and tags [${args.tags.join(", ")}]` : ""}.`,
                },
            ],
        };
    }

    const lines: string[] = [`## Top Memories for "${args.project}" (${filtered.length})\n`];
    for (let i = 0; i < filtered.length; i++) {
        const r: RetrievalResult = filtered[i];
        lines.push(`${i + 1}. **${r.memory.type}** — ${r.contentPreview.slice(0, 120)}`);
        lines.push(
            `   _confidence: ${r.memory.confidence} | importance: ${r.memory.importance} | ${r.memory.filePath}_`,
        );
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}
