import { unlink } from "node:fs/promises";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import { moveToTrash } from "../utils/trash.js";
import * as z from "zod";

export const name = "delete_note";
export const description =
    "Delete a note file from the vault. By default, moves to .trash/ (recoverable). Set permanent=true to delete immediately.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note file to delete, relative to the vault root"),
    permanent: z.boolean().default(false).describe("If true, delete immediately without moving to trash (default: false)"),
});

export async function handler({ path, permanent }: { path: string; permanent: boolean }) {
    const fullPath = resolveVaultPath(path);

    if (!(await pathExists(fullPath))) {
        return { content: [{ type: "text" as const, text: `Error: Note not found at "${path}".` }], isError: true };
    }

    if (permanent) {
        await unlink(fullPath);
        return { content: [{ type: "text" as const, text: `Note permanently deleted: "${path}".` }] };
    }

    const trashDest = await moveToTrash(fullPath);
    return {
        content: [
            {
                type: "text" as const,
                text: `Note moved to trash: "${path}". Recoverable via restore_note. Trash location: .trash/${path}`,
            },
        ],
    };
}
