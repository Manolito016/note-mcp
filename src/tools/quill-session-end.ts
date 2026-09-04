import * as z from "zod";
import { endSession, getCurrentSessionId } from "../utils/session-tracker.js";
import { logAuditEntry } from "../utils/audit-log.js";

export const name = "quill_session_end";
export const description =
    "End the current memory session. Records session summary and next actions for future sessions.";

export const inputSchema = z.object({
    summary: z.string().optional().describe("Session summary"),
    next_actions: z.array(z.string()).optional().describe("Next actions for future sessions"),
});

export async function handler(args: z.infer<typeof inputSchema>) {
    const sessionId = getCurrentSessionId();
    const record = await endSession();

    if (sessionId) {
        await logAuditEntry({
            actor: "agent",
            memoryId: sessionId,
            action: "status_change",
            previousState: { status: "active" },
            newState: { status: "ended", summary: args.summary },
            reason: "Session ended",
        });
    }

    const lines: string[] = ["✅ Session ended"];

    if (record) {
        lines.push(`- **Session ID:** ${record.sessionId}`);
        lines.push(`- **Mutations:** ${record.mutations.length}`);
        if (record.endedAt && record.startedAt) {
            const durationMs = new Date(record.endedAt).getTime() - new Date(record.startedAt).getTime();
            lines.push(`- **Duration:** ${Math.round(durationMs / 1000)}s`);
        }
    }
    if (args.summary) lines.push(`- **Summary:** ${args.summary}`);
    if (args.next_actions && args.next_actions.length > 0) {
        lines.push("");
        lines.push("### Next Actions");
        for (let i = 0; i < args.next_actions.length; i++) {
            lines.push(`${i + 1}. ${args.next_actions[i]}`);
        }
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}
