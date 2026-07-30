import { readFile } from "node:fs/promises";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import { extractLinks } from "../utils/links.js";
import * as z from "zod";

export const name = "extract_links";
export const description = "Extract all links from a note. Finds wiki-style links ([[note]]) and markdown links ([text](path.md)).";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note file, relative to the vault root"),
});

export async function handler({ path }: { path: string }) {
    const fullPath = resolveVaultPath(path);

    if (!(await pathExists(fullPath))) {
        return { content: [{ type: "text" as const, text: `Error: Note not found at "${path}".` }], isError: true };
    }

    const content = await readFile(fullPath, "utf-8");
    const links = extractLinks(content);

    const wikiCount = links.wiki.length;
    const mdCount = links.markdown.length;
    const total = wikiCount + mdCount;

    if (total === 0) {
        return { content: [{ type: "text" as const, text: `No links found in "${path}".` }] };
    }

    const parts: string[] = [`Found ${total} link(s) in "${path}":`];

    if (wikiCount > 0) {
        parts.push(`\nWiki links (${wikiCount}):`);
        parts.push(links.wiki.map((l) => `  [[${l}]]`).join("\n"));
    }

    if (mdCount > 0) {
        parts.push(`\nMarkdown links (${mdCount}):`);
        parts.push(links.markdown.map((l) => `  [${l.text}](${l.target})`).join("\n"));
    }

    return { content: [{ type: "text" as const, text: parts.join("\n") }] };
}
