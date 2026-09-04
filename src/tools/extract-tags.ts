import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { safeReadTarget } from "../utils/vault.js";
import { extractTags } from "../utils/frontmatter.js";
import * as z from "zod";

export const name = "extract_tags";
export const description =
    "Extract all tags (hashtags) from a note. Auto-appends .md if no file extension is provided.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note file, relative to the vault root (.md appended if no extension)"),
});

export async function handler({ path }: { path: string }) {
    // Auto-append .md if no file extension is present
    const resolvedPath = extname(path) ? path : `${path}.md`;
    let fullPath: string;
    try {
        fullPath = await safeReadTarget(resolvedPath);
    } catch {
        return { content: [{ type: "text" as const, text: `Error: Note not found at "${path}".` }], isError: true };
    }

    const content = await readFile(fullPath, "utf-8");
    const tags = extractTags(content);

    if (tags.length === 0) {
        return { content: [{ type: "text" as const, text: `No tags found in "${path}".` }] };
    }

    return {
        content: [
            { type: "text" as const, text: `Found ${tags.length} tag(s):\n${tags.map((t) => `#${t}`).join("\n")}` },
        ],
    };
}
