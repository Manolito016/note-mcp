import { getSessions, getSession, type SessionRecord } from "../utils/session-tracker.js";
import * as z from "zod";

export const name = "session_history";
export const description =
    "View vault session history. Shows mutations (create, update, delete, move) recorded during past sessions. Helps track knowledge base evolution over time. " +
    "Supports date filtering and JSON export.";
export const inputSchema = z.object({
    limit: z.number().min(1).max(50).default(10).describe("Number of recent sessions to show (default: 10)"),
    sessionId: z.string().optional().describe("Get details for a specific session ID"),
    from: z.string().optional().describe("Only show sessions started after this ISO date"),
    to: z.string().optional().describe("Only show sessions started before this ISO date"),
    json: z.boolean().default(false).describe("If true, output as structured JSON"),
});

export async function handler({
    limit,
    sessionId,
    from,
    to,
    json,
}: {
    limit: number;
    sessionId?: string;
    from?: string;
    to?: string;
    json: boolean;
}) {
    if (sessionId) {
        const session = await getSession(sessionId);
        if (!session) {
            return {
                content: [{ type: "text" as const, text: `Error: Session "${sessionId}" not found.` }],
                isError: true,
            };
        }
        if (json) {
            return { content: [{ type: "text" as const, text: JSON.stringify(session, null, 2) }] };
        }
        return formatSessionDetail(session);
    }

    let sessions = await getSessions(limit);

    // Date filtering
    if (from) {
        sessions = sessions.filter((s) => s.startedAt >= from!);
    }
    if (to) {
        sessions = sessions.filter((s) => s.startedAt <= to!);
    }

    // JSON export
    if (json) {
        return { content: [{ type: "text" as const, text: JSON.stringify(sessions, null, 2) }] };
    }

    if (sessions.length === 0) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: "No session history found. Sessions are recorded when vault mutations occur.",
                },
            ],
        };
    }

    const lines: string[] = [`Session History (last ${sessions.length} sessions):`, ""];

    for (const session of sessions) {
        const summary = session.summary || {
            created: session.mutations.filter((m) => m.type === "create").length,
            updated: session.mutations.filter((m) => m.type === "update").length,
            deleted: session.mutations.filter((m) => m.type === "delete").length,
            moved: session.mutations.filter((m) => m.type === "move").length,
            restored: session.mutations.filter((m) => m.type === "restore").length,
        };

        const total = summary.created + summary.updated + summary.deleted + summary.moved + summary.restored;
        const status = session.endedAt ? "ended" : "active";
        const duration = session.endedAt
            ? formatDuration(new Date(session.startedAt), new Date(session.endedAt))
            : "ongoing";

        lines.push(`  ${session.sessionId} [${status}] (${duration})`);
        lines.push(`    Started: ${formatDate(session.startedAt)}`);
        if (session.endedAt) {
            lines.push(`    Ended: ${formatDate(session.endedAt)}`);
        }
        lines.push(
            `    Mutations: ${total} (${summary.created} created, ${summary.updated} updated, ${summary.deleted} deleted, ${summary.moved} moved, ${summary.restored} restored)`,
        );
        lines.push("");
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}

function formatSessionDetail(session: SessionRecord) {
    const lines: string[] = [
        `Session: ${session.sessionId}`,
        `Started: ${formatDate(session.startedAt)}`,
        session.endedAt ? `Ended: ${formatDate(session.endedAt)}` : "Status: active",
        "",
        `Mutations (${session.mutations.length}):`,
        "",
    ];

    for (const m of session.mutations) {
        const icon = getMutationIcon(m.type);
        const time = formatTime(m.timestamp);
        if (m.type === "move" && m.oldPath) {
            lines.push(`  ${time} ${icon} ${m.oldPath} → ${m.path}`);
        } else {
            lines.push(`  ${time} ${icon} ${m.path}`);
        }
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}

function getMutationIcon(type: string): string {
    switch (type) {
        case "create":
            return "+";
        case "update":
            return "~";
        case "delete":
            return "-";
        case "move":
            return ">";
        case "restore":
            return "↩";
        default:
            return "?";
    }
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString();
}

function formatDuration(start: Date, end: Date): string {
    const ms = end.getTime() - start.getTime();
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return "<1 min";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
}
