import * as z from "zod";
import { resolveConflict, getSupersessionChain } from "../utils/conflict-engine.js";
import type { ResolutionAction } from "../utils/conflict-engine.js";

export const name = "quill_resolve_conflict";
export const description =
    "Resolve a conflict between two memories. " +
    "Actions: supersede (keep one, archive other), reject (both rejected), or manual_review (flag for human). " +
    "Supports batch mode to auto-resolve all detected conflicts by keeping the higher-confidence memory.";

export const inputSchema = z.object({
    memory_id_a: z.string().optional().describe("First memory ID in conflict (not required for batch mode)"),
    memory_id_b: z.string().optional().describe("Second memory ID in conflict (not required for batch mode)"),
    action: z
        .enum(["supersede", "reject", "manual_review"])
        .optional()
        .describe("Resolution action (not required for batch mode)"),
    keeper: z.string().optional().describe("Memory ID to keep (required for supersede)"),
    reason: z.string().optional().describe("Reason for resolution choice"),
    batch: z
        .boolean()
        .default(false)
        .describe("If true, auto-resolve all conflicts in the project by keeping the higher-confidence memory"),
    project: z.string().optional().describe("Project to batch-resolve conflicts for (required for batch mode)"),
});

export async function handler(args: z.infer<typeof inputSchema>) {
    // Batch auto-resolve mode
    if (args.batch) {
        if (!args.project) {
            return {
                content: [{ type: "text" as const, text: "Error: 'project' is required for batch mode." }],
                isError: true,
            };
        }
        const { detectConflicts } = await import("../utils/conflict-engine.js");
        const detection = await detectConflicts(args.project);

        if (detection.conflicts.length === 0) {
            return {
                content: [{ type: "text" as const, text: `No conflicts to resolve in project "${args.project}".` }],
            };
        }

        const lines: string[] = [`## Batch Conflict Resolution (${detection.conflicts.length} conflicts)\n`];
        let resolved = 0;

        for (const c of detection.conflicts) {
            // Auto-resolve: keep the higher-confidence memory
            const keeper = c.memoryA.confidence >= c.memoryB.confidence ? c.memoryA : c.memoryB;
            const other = keeper === c.memoryA ? c.memoryB : c.memoryA;

            try {
                const result = await resolveConflict(
                    c.memoryA.id,
                    c.memoryB.id,
                    "supersede",
                    keeper.id,
                    `Auto-resolved: kept ${keeper.id} (confidence: ${keeper.confidence}) over ${other.id} (confidence: ${other.confidence})`,
                );
                if (result.success) {
                    resolved++;
                    lines.push(
                        `- ✓ Superseded ${other.id} → kept ${keeper.id} (confidence: ${keeper.confidence} vs ${other.confidence})`,
                    );
                }
            } catch (err) {
                lines.push(`- ✗ Failed to resolve ${c.memoryA.id} vs ${c.memoryB.id}: ${(err as Error).message}`);
            }
        }

        lines.push(`\n**Resolved ${resolved}/${detection.conflicts.length} conflicts.**`);
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }

    // Single conflict resolution
    if (!args.memory_id_a || !args.memory_id_b || !args.action) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: "Error: memory_id_a, memory_id_b, and action are required for single resolution. Use batch: true for auto-resolve.",
                },
            ],
            isError: true,
        };
    }

    const result = await resolveConflict(
        args.memory_id_a,
        args.memory_id_b,
        args.action as ResolutionAction,
        args.keeper,
        args.reason,
    );

    const lines: string[] = [];

    if (result.success) {
        lines.push(`✅ Conflict resolved: **${args.action}**`);
        lines.push(`- Memory A: ${result.memoryA.id} → ${result.memoryA.newStatus}`);
        lines.push(`- Memory B: ${result.memoryB.id} → ${result.memoryB.newStatus}`);
        if (args.reason) lines.push(`- Reason: ${args.reason}`);

        // Show supersession chain if relevant
        if (args.action === "supersede") {
            const keeperId = args.keeper ?? args.memory_id_a;
            const chain = await getSupersessionChain(keeperId);
            if (chain.length > 1) {
                lines.push(`- Supersession chain: ${chain.join(" → ")}`);
            }
        }
    } else {
        lines.push(`❌ Resolution failed`);
        lines.push(`- Memory A: ${result.memoryA.id} (status: ${result.memoryA.newStatus})`);
        lines.push(`- Memory B: ${result.memoryB.id} (status: ${result.memoryB.newStatus})`);
    }

    lines.push(`- Audit entries: ${result.auditEntries}`);

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}
