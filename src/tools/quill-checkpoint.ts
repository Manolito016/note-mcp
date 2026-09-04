import * as z from "zod";
import { createCheckpoint } from "../utils/checkpoint.js";

export const name = "quill_checkpoint";
export const description =
    "Create a memory checkpoint capturing project state — decisions, constraints, discoveries, errors, and lessons. " +
    "Checkpoints enable context reconstruction after compaction or session restart.";

export const inputSchema = z.object({
    project: z.string().describe("Project to checkpoint"),
    label: z.string().optional().describe("Human-readable label"),
    objective: z.string().optional().describe("Current objective"),
    current_state: z.string().optional().describe("Current implementation state"),
    known_problems: z.array(z.string()).optional().describe("Known problems"),
    next_actions: z.array(z.string()).optional().describe("Next actions to take"),
});

export async function handler(args: z.infer<typeof inputSchema>) {
    const result = await createCheckpoint({
        project: args.project,
        label: args.label,
        objective: args.objective,
        currentState: args.current_state,
        knownProblems: args.known_problems,
        nextActions: args.next_actions,
    });

    const lines: string[] = [
        `✅ Checkpoint created: **${result.checkpointId}**`,
        `- **Project:** ${args.project}`,
        `- **Memories captured:** ${result.memoryCount}`,
        `- **File:** ${result.filePath}`,
        "",
        "### Sections",
    ];

    const sectionEntries: Array<[string, string]> = [
        ["Decisions", "decisions"],
        ["Constraints", "constraints"],
        ["Discoveries", "discoveries"],
        ["Errors", "errors"],
        ["Lessons", "lessons"],
        ["Architecture", "architecture"],
        ["Other", "other"],
    ];

    for (const [label, key] of sectionEntries) {
        const items = result.sections[key as keyof typeof result.sections];
        lines.push(`- **${label}:** ${items.length} memories`);
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}
