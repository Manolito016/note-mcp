import { readdir, readFile } from "node:fs/promises";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import * as z from "zod";

export const name = "search_notes";
export const description = "Search note contents by text pattern. Returns matching file paths and the matching line.";
export const inputSchema = z.object({
    query: z.string().describe("Text to search for (case-insensitive)"),
    path: z.string().default(".").describe("Directory to search in, relative to the vault root (default: root)"),
    fileExtension: z.string().default(".md").describe("File extension to search (default: .md)"),
});

export async function handler({ query, path, fileExtension }: { query: string; path: string; fileExtension: string }) {
    const dirPath = resolveVaultPath(path);

    if (!(await pathExists(dirPath))) {
        return { content: [{ type: "text" as const, text: `Error: Directory not found at "${path}".` }], isError: true };
    }

    const results: string[] = [];
    const lowerQuery = query.toLowerCase();

    async function searchDir(dir: string) {
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = `${dir}/${item.name}`;
            if (item.isDirectory()) {
                await searchDir(fullPath);
            } else if (item.name.endsWith(fileExtension)) {
                try {
                    const content = await readFile(fullPath, "utf-8");
                    const lines = content.split("\n");
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].toLowerCase().includes(lowerQuery)) {
                            const relPath = fullPath.startsWith(dirPath)
                                ? fullPath.slice(dirPath.length + 1)
                                : fullPath;
                            results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
                        }
                    }
                } catch {
                    // Skip unreadable files
                }
            }
        }
    }

    await searchDir(dirPath);

    if (results.length === 0) {
        return { content: [{ type: "text" as const, text: `No matches found for "${query}".` }] };
    }

    return { content: [{ type: "text" as const, text: `Found ${results.length} match(es):\n${results.join("\n")}` }] };
}
