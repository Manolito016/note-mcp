import { readdir, readFile } from "node:fs/promises";
import { resolveVaultPath, pathExists, getVaultRoot } from "../utils/vault.js";
import { extractLinks } from "../utils/links.js";
import * as z from "zod";

export const name = "find_backlinks";
export const description = "Find all notes that link to a given note (backlinks). Searches for wiki-style links ([[note]]) and markdown links.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the target note (without .md extension for wiki links, or with .md for markdown links)"),
    searchPath: z.string().default(".").describe("Directory to search in, relative to the vault root (default: root)"),
});

export async function handler({ path, searchPath }: { path: string; searchPath: string }) {
    const dirPath = resolveVaultPath(searchPath);

    if (!(await pathExists(dirPath))) {
        return { content: [{ type: "text" as const, text: `Error: Directory not found at "${searchPath}".` }], isError: true };
    }

    // Normalize the target name for matching
    // For wiki links: match the note name without extension
    // For markdown links: match the path with .md extension
    const noteName = path.replace(/\.md$/, "");
    const notePathWithExt = path.endsWith(".md") ? path : `${path}.md`;

    const backlinks: { file: string; line: number; context: string; type: "wiki" | "markdown" }[] = [];

    async function searchDir(dir: string) {
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = `${dir}/${item.name}`;
            if (item.isDirectory()) {
                await searchDir(fullPath);
            } else if (item.name.endsWith(".md")) {
                try {
                    const content = await readFile(fullPath, "utf-8");
                    const lines = content.split("\n");
                    const relPath = fullPath.startsWith(getVaultRoot())
                        ? fullPath.slice(getVaultRoot().length + 1)
                        : fullPath;

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];

                        // Check for wiki-style backlinks: [[target]] or [[target|...]]
                        const wikiRegex = new RegExp(`\\[\\[${escapeRegex(noteName)}(?:\\|[^\\]]+)?\\]\\]`, "g");
                        if (wikiRegex.test(line)) {
                            backlinks.push({ file: relPath, line: i + 1, context: line.trim(), type: "wiki" });
                        }

                        // Check for markdown backlinks: [text](target.md)
                        const mdRegex = new RegExp(`\\[([^\\]]+)\\]\\(${escapeRegex(notePathWithExt)}(?:#[^)]*)?\\)`, "g");
                        if (mdRegex.test(line)) {
                            backlinks.push({ file: relPath, line: i + 1, context: line.trim(), type: "markdown" });
                        }
                    }
                } catch {
                    // Skip unreadable files
                }
            }
        }
    }

    await searchDir(dirPath);

    if (backlinks.length === 0) {
        return { content: [{ type: "text" as const, text: `No backlinks found for "${path}".` }] };
    }

    const wikiLinks = backlinks.filter((b) => b.type === "wiki");
    const mdLinks = backlinks.filter((b) => b.type === "markdown");

    const parts: string[] = [`Found ${backlinks.length} backlink(s) for "${path}":`];

    if (wikiLinks.length > 0) {
        parts.push(`\nWiki-style backlinks (${wikiLinks.length}):`);
        for (const bl of wikiLinks) {
            parts.push(`  ${bl.file}:${bl.line}: ${bl.context}`);
        }
    }

    if (mdLinks.length > 0) {
        parts.push(`\nMarkdown backlinks (${mdLinks.length}):`);
        for (const bl of mdLinks) {
            parts.push(`  ${bl.file}:${bl.line}: ${bl.context}`);
        }
    }

    return { content: [{ type: "text" as const, text: parts.join("\n") }] };
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
