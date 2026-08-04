import { readdir, readFile } from "node:fs/promises";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import * as z from "zod";

export const name = "search_notes";
export const description = "Search note contents by text pattern. Returns matching file paths and the matching line.";
export const inputSchema = z.object({
    query: z.string().describe("Text or regex pattern to search for"),
    path: z.string().default(".").describe("Directory to search in, relative to the vault root (default: root)"),
    fileExtension: z.string().default(".md").describe("File extension to search (default: .md)"),
    useRegex: z.boolean().default(false).describe("If true, treat query as a regex pattern (default: false)"),
    limit: z.number().optional().describe("Maximum number of results to return"),
    offset: z.number().default(0).describe("Number of results to skip (for pagination)"),
});

export async function handler({ query, path, fileExtension, useRegex, limit, offset }: { query: string; path: string; fileExtension: string; useRegex: boolean; limit?: number; offset: number }) {
    const dirPath = resolveVaultPath(path);

    if (!(await pathExists(dirPath))) {
        return { content: [{ type: "text" as const, text: `Error: Directory not found at "${path}".` }], isError: true };
    }

    const results: string[] = [];
    let searchPattern: RegExp;

    try {
        searchPattern = useRegex ? new RegExp(query, "i") : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: Invalid regex pattern: "${query}".` }], isError: true };
    }

    async function searchDir(dir: string) {
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
            if (item.name === ".trash") continue;
            const fullPath = `${dir}/${item.name}`;
            if (item.isDirectory()) {
                await searchDir(fullPath);
            } else if (item.name.endsWith(fileExtension)) {
                try {
                    const content = await readFile(fullPath, "utf-8");
                    const lines = content.split("\n");
                    for (let i = 0; i < lines.length; i++) {
                        if (searchPattern.test(lines[i])) {
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

    const total = results.length;
    const paginatedResults = limit ? results.slice(offset, offset + limit) : results.slice(offset);
    
    // Only show pagination info when actually paginating
    const isPaginated = limit !== undefined || offset > 0;
    const prefix = isPaginated ? `Showing ${paginatedResults.length} of ${total} match(es):\n` : `Found ${total} match(es):\n`;

    return { content: [{ type: "text" as const, text: `${prefix}${paginatedResults.join("\n")}` }] };
}
