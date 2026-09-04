import * as z from "zod";
import { MEMORY_TYPES } from "../utils/memory-schema.js";
import type { MemoryType } from "../utils/memory-schema.js";
import { detectConflicts } from "../utils/conflict-engine.js";
import type { ConflictPair } from "../utils/conflict-engine.js";

export const name = "quill_detect_conflicts";
export const description =
    "Detect contradictory memories within a project. " +
    "Compares same-entity memories to find conflicting values. Conservative approach — flags potential conflicts for review.";

export const inputSchema = z.object({
    project: z.string().describe("Project to scan for conflicts"),
    type: z.enum(MEMORY_TYPES).optional().describe("Limit to specific memory type"),
});

export async function handler(args: z.infer<typeof inputSchema>) {
    const result = await detectConflicts(args.project, args.type as MemoryType | undefined);

    if (result.conflicts.length === 0) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: `✅ No conflicts detected in project "${args.project}" (scanned ${result.scannedCount} memories).`,
                },
            ],
        };
    }

    const lines: string[] = [
        `## Conflicts Detected: ${result.conflicts.length} (scanned ${result.scannedCount} memories)\n`,
    ];

    for (let i = 0; i < result.conflicts.length; i++) {
        const c: ConflictPair = result.conflicts[i];
        const sevIcon = c.severity === "definite" ? "🔴" : c.severity === "likely" ? "🟡" : "🟠";
        lines.push(`### ${i + 1}. ${sevIcon} ${c.severity.toUpperCase()} — Entity: "${c.conflictingEntity}"`);
        lines.push(`- **Memory A:** ${c.memoryA.id} (${c.memoryA.type}, confidence: ${c.memoryA.confidence})`);
        lines.push(`- **Memory B:** ${c.memoryB.id} (${c.memoryB.type}, confidence: ${c.memoryB.confidence})`);
        lines.push(`- **Reason:** ${c.reason}`);
        lines.push("");
    }

    lines.push("---");
    lines.push(
        "*Use `quill_resolve_conflict` to resolve each conflict (supersede, reject, or flag for manual review).*",
    );

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}
