import * as z from "zod";
import { consolidate } from "../utils/consolidation.js";

export const name = "quill_consolidate";
export const description =
    "Consolidate memories for a project. Actions: merge_duplicates (Jaccard similarity), " +
    "promote_important (referenced by many), archive_obsolete (stale or low confidence). " +
    "Without confirm=true, returns suggestions only.";

export const inputSchema = z.object({
    project: z.string().describe("Project to consolidate"),
    action: z
        .enum(["merge_duplicates", "promote_important", "archive_obsolete", "all"])
        .describe("Consolidation action type. Use 'all' to run all actions."),
    confirm: z.boolean().optional().describe("Confirm destructive actions (required to execute changes)"),
    threshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Override Jaccard similarity threshold for merge_duplicates (default: 0.7)"),
});

export async function handler(args: z.infer<typeof inputSchema>) {
    const actions =
        args.action === "all"
            ? (["merge_duplicates", "promote_important", "archive_obsolete"] as const)
            : ([args.action] as const);

    const allLines: string[] = [];
    let totalCandidates = 0;
    let totalActions = 0;
    let totalSuggestions = 0;

    for (const action of actions) {
        const result = await consolidate({
            project: args.project,
            action,
            confirm: args.confirm,
        });

        totalCandidates += result.candidatesFound;
        totalActions += result.actionsTaken.length;
        totalSuggestions += result.suggestions.length;

        allLines.push(`### ${action}`);
        allLines.push(`- **Candidates found:** ${result.candidatesFound}`);
        allLines.push(`- **Mode:** ${args.confirm ? "EXECUTE" : "SUGGESTIONS ONLY"}`);
        allLines.push("");

        if (result.actionsTaken.length > 0) {
            allLines.push("**Actions Taken:**");
            for (const a of result.actionsTaken) {
                allLines.push(`- **${a.type}:** ${a.memoryIds.join(", ")} — ${a.reason}`);
            }
            allLines.push("");
        }

        if (result.suggestions.length > 0) {
            allLines.push("**Suggestions:**");
            allLines.push("*Set `confirm: true` to execute these changes.*");
            for (const s of result.suggestions) {
                const detail =
                    s.currentImportance && s.suggestedImportance
                        ? ` (${s.currentImportance} → ${s.suggestedImportance})`
                        : "";
                allLines.push(`- **${s.type}:** ${s.memoryId}${detail} — ${s.reason}`);
            }
            allLines.push("");
        }

        if (result.actionsTaken.length === 0 && result.suggestions.length === 0) {
            allLines.push("No consolidation actions needed.");
            allLines.push("");
        }
    }

    const header = [
        `## Consolidation Report`,
        `- **Project:** ${args.project}`,
        `- **Actions run:** ${actions.join(", ")}`,
        `- **Total candidates:** ${totalCandidates}`,
        `- **Total actions taken:** ${totalActions}`,
        `- **Total suggestions:** ${totalSuggestions}`,
        "",
    ];

    return { content: [{ type: "text" as const, text: [...header, ...allLines].join("\n") }] };
}
