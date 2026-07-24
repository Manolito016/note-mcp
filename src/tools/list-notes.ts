import { readdir } from "node:fs/promises";
import { resolveVaultPath, pathExists, getPathStats } from "../utils/vault.js";
import * as z from "zod";

export const name = "list_notes";
export const description = "List notes and folders in a directory. Supports recursive mode.";
export const inputSchema = z.object({
    path: z.string().default(".").describe("Directory path relative to the vault root (default: root)"),
    recursive: z.boolean().default(false).describe("If true, list all files recursively"),
    limit: z.number().optional().describe("Maximum number of entries to return"),
    offset: z.number().default(0).describe("Number of entries to skip (for pagination)"),
});

export async function handler({ path, recursive, limit, offset }: { path: string; recursive: boolean; limit?: number; offset: number }) {
    const dirPath = resolveVaultPath(path);

    if (!(await pathExists(dirPath))) {
        return { content: [{ type: "text" as const, text: `Error: Directory not found at "${path}".` }], isError: true };
    }

    const entries: string[] = [];

    async function listDir(dir: string, prefix: string) {
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
            const relPath = prefix ? `${prefix}/${item.name}` : item.name;
            if (item.isDirectory()) {
                entries.push(`[DIR]  ${relPath}/`);
                if (recursive) {
                    await listDir(`${dir}/${item.name}`, relPath);
                }
            } else {
                entries.push(`[FILE] ${relPath}`);
            }
        }
    }

    await listDir(dirPath, path === "." ? "" : path);

    if (entries.length === 0) {
        return { content: [{ type: "text" as const, text: "Directory is empty." }] };
    }

    const total = entries.length;
    const paginatedEntries = limit ? entries.slice(offset, offset + limit) : entries.slice(offset);
    
    // Only show pagination info when actually paginating
    const isPaginated = limit !== undefined || offset > 0;
    const prefix = isPaginated ? `Showing ${paginatedEntries.length} of ${total} entries\n\n` : "";

    return { content: [{ type: "text" as const, text: `${prefix}${paginatedEntries.join("\n")}` }] };
}
