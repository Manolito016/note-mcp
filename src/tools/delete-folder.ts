import { rm } from "node:fs/promises";
import { resolveVaultPath, pathExists, getPathStats } from "../utils/vault.js";
import { moveToTrash } from "../utils/trash.js";
import * as z from "zod";

export const name = "delete_folder";
export const description =
    "Delete a folder and all its contents. By default, moves to .trash/ (recoverable). Set permanent=true to delete immediately.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the folder to delete, relative to the vault root"),
    recursive: z.boolean().default(true).describe("If true, delete all contents recursively (default: true)"),
    permanent: z.boolean().default(false).describe("If true, delete immediately without moving to trash (default: false)"),
});

export async function handler({ path, recursive, permanent }: { path: string; recursive: boolean; permanent: boolean }) {
    const fullPath = resolveVaultPath(path);

    if (!(await pathExists(fullPath))) {
        return { content: [{ type: "text" as const, text: `Error: Folder not found at "${path}".` }], isError: true };
    }

    const stats = await getPathStats(fullPath);
    if (!stats.isDirectory) {
        return { content: [{ type: "text" as const, text: `Error: Path is not a folder: "${path}".` }], isError: true };
    }

    if (permanent) {
        await rm(fullPath, { recursive, force: true });
        return { content: [{ type: "text" as const, text: `Folder permanently deleted: "${path}".` }] };
    }

    const trashDest = await moveToTrash(fullPath);
    return {
        content: [
            {
                type: "text" as const,
                text: `Folder moved to trash: "${path}". Recoverable via restore_note. Trash location: .trash/${path}`,
            },
        ],
    };
}
