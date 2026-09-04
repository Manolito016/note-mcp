import * as z from "zod";
import { queryAuditLog } from "../utils/audit-log.js";
import type { AuditFilter, AuditAction } from "../utils/audit-log.js";

export const name = "quill_audit";
export const description =
    "Query the memory audit log. Shows what changed, when, why, and by whom. " +
    "Supports filtering by memory ID, action type, date range, and actor.";

export const inputSchema = z.object({
    memory_id: z.string().optional().describe("Filter by memory ID"),
    action: z.string().optional().describe("Filter by action type"),
    from: z.string().optional().describe("Start date (ISO)"),
    to: z.string().optional().describe("End date (ISO)"),
    limit: z.number().min(1).max(200).default(50).describe("Max entries to return (default: 50)"),
    json: z.boolean().default(false).describe("If true, output as structured JSON"),
});

export async function handler(args: z.infer<typeof inputSchema>) {
    const filter: AuditFilter = { limit: args.limit };
    if (args.memory_id) filter.memoryId = args.memory_id;
    if (args.action) filter.action = args.action as AuditAction;
    if (args.from) filter.from = args.from;
    if (args.to) filter.to = args.to;

    const entries = await queryAuditLog(filter);

    if (entries.length === 0) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: `No audit entries found${args.memory_id ? ` for memory "${args.memory_id}"` : ""}.`,
                },
            ],
        };
    }

    // JSON export
    if (args.json) {
        return {
            content: [{ type: "text" as const, text: JSON.stringify(entries, null, 2) }],
        };
    }

    const lines: string[] = [`## Audit Log (${entries.length} entries)\n`];

    for (const entry of entries) {
        const ts = entry.timestamp.replace("T", " ").slice(0, 19);
        lines.push(`- **${ts}** | ${entry.actor} | \`${entry.action}\` | ${entry.memoryId}`);
        if (entry.reason) lines.push(`  _${entry.reason}_`);
        if (entry.previousState) {
            const prev = JSON.stringify(entry.previousState);
            const next = JSON.stringify(entry.newState);
            lines.push(`  ${prev} → ${next}`);
        }
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}
