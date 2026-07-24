import { rm } from "node:fs/promises";
import { resolveVaultPath, pathExists, getPathStats } from "../utils/vault.js";
import * as z from "zod";

export const name = "delete_folder";
export const description = "Delete a folder and all its contents from the vault. Use with caution — this is irreversible.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the folder to delete, relative to the vault root"),
    recursive: z.boolean().default(true).describe("If true, delete all contents recursively (default: true)"),
});

export async function handler({ path, recursive }: { path: string; recursive: boolean }) {
    const fullPath = resolveVaultPath(path);

    if (!(await pathExists(fullPath))) {
        return { content: [{ type: "text" as const, text: `Error: Folder not found at "${path}".` }], isError: true };
    }

    const stats = await getPathStats(fullPath);
    if (!stats.isDirectory) {
        return { content: [{ type: "text" as const, text: `Error: Path is not a folder: "${path}".` }], isError: true };
    }

    await rm(fullPath, { recursive, force: true });
    return { content: [{ type: "text" as const, text: `Folder deleted: "${path}".` }] };
}
