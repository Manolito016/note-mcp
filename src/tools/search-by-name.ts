import { readdir } from "node:fs/promises";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import * as z from "zod";

export const name = "search_by_name";
export const description = "Search for notes by filename pattern. Supports glob-like matching.";
export const inputSchema = z.object({
    pattern: z.string().describe("Filename pattern to match (supports * as wildcard)"),
    path: z.string().default(".").describe("Directory to search in, relative to the vault root (default: root)"),
    recursive: z.boolean().default(true).describe("If true, search recursively (default: true)"),
});

export async function handler({ pattern, path, recursive }: { pattern: string; path: string; recursive: boolean }) {
    const dirPath = resolveVaultPath(path);

    if (!(await pathExists(dirPath))) {
        return { content: [{ type: "text" as const, text: `Error: Directory not found at "${path}".` }], isError: true };
    }

    const results: string[] = [];
    const regexPattern = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$", "i");

    async function searchDir(dir: string, prefix: string) {
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
            const relPath = prefix ? `${prefix}/${item.name}` : item.name;
            if (item.isFile() && regexPattern.test(item.name)) {
                results.push(relPath);
            } else if (item.isDirectory() && recursive) {
                await searchDir(`${dir}/${item.name}`, relPath);
            }
        }
    }

    await searchDir(dirPath, path === "." ? "" : path);

    if (results.length === 0) {
        return { content: [{ type: "text" as const, text: `No files matching pattern "${pattern}".` }] };
    }

    return { content: [{ type: "text" as const, text: `Found ${results.length} file(s):\n${results.join("\n")}` }] };
}
