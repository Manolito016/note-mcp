import * as z from "zod";
import { startSession } from "../utils/session-tracker.js";
import { recall } from "../utils/retrieval-engine.js";
import { logAuditEntry } from "../utils/audit-log.js";

export const name = "quill_session_start";
export const description =
    "Start a memory-aware session for a project. " +
    "Records session start, retrieves top project memories for context bootstrapping.";

export const inputSchema = z.object({
    project: z.string().describe("Project for this session"),
    objective: z.string().optional().describe("Session objective"),
});

export async function handler(args: z.infer<typeof inputSchema>) {
    const sessionId = await startSession();

    // Audit log session start
    await logAuditEntry({
        actor: "agent",
        memoryId: sessionId,
        action: "create",
        newState: { project: args.project, objective: args.objective, type: "SESSION" },
        reason: "Session started",
    });

    // Retrieve top memories for context
    const memories = await recall(args.project, 10);

    const lines: string[] = [`✅ Session started: **${sessionId}**`, `- **Project:** ${args.project}`];
    if (args.objective) lines.push(`- **Objective:** ${args.objective}`);
    lines.push("");

    if (memories.length > 0) {
        lines.push(`### Top Memories (${memories.length})`);
        for (let i = 0; i < memories.length; i++) {
            const r = memories[i];
            lines.push(`${i + 1}. **${r.memory.type}** — ${r.contentPreview.slice(0, 100)}`);
        }
    } else {
        lines.push("*No existing memories for this project. Use quill_write or quill_record_* to create memories.*");
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}
