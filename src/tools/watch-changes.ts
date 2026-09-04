import { vaultWatcher } from "../utils/watcher.js";
import * as z from "zod";

export const name = "watch_changes";
export const description =
    "Check for external file changes detected since last poll. Returns created, modified, and deleted files. " +
    "Useful for detecting changes from other editors or tools. Supports path filtering and event history.";
export const inputSchema = z.object({
    clear: z.boolean().default(true).describe("If true, clear pending changes after reading (default: true)"),
    path_filter: z.string().optional().describe("Only show changes matching this path prefix (e.g. 'knowledge/')"),
    history: z.boolean().default(false).describe("If true, show all pending change events with timestamps"),
});

export async function handler({
    clear,
    path_filter,
    history,
}: {
    clear: boolean;
    path_filter?: string;
    history: boolean;
}) {
    const pendingCount = vaultWatcher.getPendingCount();

    if (pendingCount === 0) {
        return { content: [{ type: "text" as const, text: "No external changes detected." }] };
    }

    let changes = clear ? vaultWatcher.getChanges() : vaultWatcher.peekChanges();

    // Path filter
    if (path_filter) {
        changes = changes.filter((c) => c.path.startsWith(path_filter));
    }

    if (changes.length === 0) {
        return { content: [{ type: "text" as const, text: `No changes matching path filter "${path_filter}".` }] };
    }

    // Event history mode: show timestamps
    if (history) {
        const lines: string[] = [`Detected ${changes.length} external change(s):\n`];
        for (const c of changes) {
            const icon = c.type === "created" ? "+" : c.type === "modified" ? "~" : "-";
            const ts = c.timestamp.replace("T", " ").slice(0, 19);
            lines.push(`  ${icon} ${c.path}  (${ts})`);
        }
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }

    const grouped = {
        created: changes.filter((c) => c.type === "created").map((c) => c.path),
        modified: changes.filter((c) => c.type === "modified").map((c) => c.path),
        deleted: changes.filter((c) => c.type === "deleted").map((c) => c.path),
    };

    const lines: string[] = [`Detected ${changes.length} external change(s):`];

    if (grouped.created.length > 0) {
        lines.push(`\n  Created (${grouped.created.length}):`);
        grouped.created.forEach((p) => lines.push(`    + ${p}`));
    }
    if (grouped.modified.length > 0) {
        lines.push(`\n  Modified (${grouped.modified.length}):`);
        grouped.modified.forEach((p) => lines.push(`    ~ ${p}`));
    }
    if (grouped.deleted.length > 0) {
        lines.push(`\n  Deleted (${grouped.deleted.length}):`);
        grouped.deleted.forEach((p) => lines.push(`    - ${p}`));
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}
