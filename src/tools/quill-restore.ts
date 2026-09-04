import * as z from "zod";
import { restoreContext } from "../utils/checkpoint.js";

export const name = "quill_restore";
export const description =
    "Restore agent context from the latest checkpoint. " +
    "Retrieves memories ranked by importance with token budget awareness. " +
    "Use at session start to recover project context after compaction.";

export const inputSchema = z.object({
    project: z.string().optional().describe("Project to restore context for"),
    mode: z.enum(["compact", "standard", "deep"]).default("standard").describe("Context budget mode"),
    label: z.string().optional().describe("Specific checkpoint label to restore from"),
});

export async function handler(args: z.infer<typeof inputSchema>) {
    const result = await restoreContext(args.project, args.mode);

    const lines: string[] = [];

    if (result.checkpoint) {
        lines.push(`## Restored from Checkpoint: ${result.checkpoint.label}`);
        lines.push(`- **Project:** ${result.checkpoint.project}`);
        lines.push(`- **Created:** ${result.checkpoint.created}`);
        if (result.checkpoint.objective) lines.push(`- **Objective:** ${result.checkpoint.objective}`);
        lines.push("");
    } else {
        lines.push("## Context Restore (no checkpoint found)");
        lines.push("Restoring from active memories only.\n");
    }

    lines.push(`### Memories (${result.memories.length}, mode: ${result.mode})`);
    lines.push(`*Estimated tokens: ~${result.tokenEstimate}*\n`);

    for (let i = 0; i < result.memories.length; i++) {
        const r = result.memories[i];
        lines.push(`${i + 1}. **${r.memory.type}** [${r.memory.importance}] — ${r.contentPreview.slice(0, 120)}`);
        lines.push(`   _${r.memory.id} | confidence: ${r.memory.confidence} | ${r.memory.filePath}_`);
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}
