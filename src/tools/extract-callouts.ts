import { readFile } from "node:fs/promises";
import { safeReadTarget } from "../utils/vault.js";
import { extractCallouts } from "../utils/callouts.js";
import * as z from "zod";

export const name = "extract_callouts";
export const description =
    "Extract Obsidian callouts from a note. Returns callout types, titles, content, fold state, and line numbers.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note file, relative to the vault root"),
});

export async function handler({ path }: { path: string }) {
    let fullPath: string;
    try {
        fullPath = await safeReadTarget(path);
    } catch {
        return { content: [{ type: "text" as const, text: `Error: Note not found at "${path}".` }], isError: true };
    }

    const content = await readFile(fullPath, "utf-8");
    const callouts = extractCallouts(content);

    const lines: string[] = [];
    if (callouts.length === 0) {
        lines.push(`No callouts found in "${path}".`);
    } else {
        lines.push(`Found ${callouts.length} callout(s) in "${path}":\n`);
        for (const c of callouts) {
            const foldInfo = c.foldable ? (c.collapsed ? " [collapsed]" : " [expanded]") : "";
            lines.push(`  Line ${c.line}: [!${c.type}]${c.title ? ` ${c.title}` : ""}${foldInfo}`);
            if (c.content) {
                const preview = c.content.length > 100 ? c.content.slice(0, 100) + "..." : c.content;
                lines.push(`    ${preview.replace(/\n/g, "\n    ")}`);
            }
        }
    }

    const result = {
        path,
        callouts: callouts.map((c) => ({
            type: c.type,
            title: c.title || undefined,
            content: c.content || undefined,
            foldable: c.foldable,
            collapsed: c.collapsed,
            line: c.line,
        })),
    };

    return {
        content: [
            { type: "text" as const, text: lines.join("\n") },
            { type: "text" as const, text: `\n\n${JSON.stringify(result, null, 2)}` },
        ],
    };
}
