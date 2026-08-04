import { resolveVaultPath, pathExists, getVaultRoot } from "../utils/vault.js";
import { getTrashPath, restoreFromTrash, listTrash } from "../utils/trash.js";
import { join } from "node:path";
import * as z from "zod";

export const name = "restore_note";
export const description =
    "Restore a note or folder from the trash back to its original location. Use list_trash first to see available items.";
export const inputSchema = z.object({
    path: z.string().describe("Path of the item inside .trash/ (e.g., 'knowledge/my-note.md')"),
});

export async function handler({ path }: { path: string }) {
    const trashRoot = getTrashPath();
    const trashItemPath = join(trashRoot, path);

    if (!(await pathExists(trashItemPath))) {
        return {
            content: [{ type: "text" as const, text: `Error: Item not found in trash at ".trash/${path}".` }],
            isError: true,
        };
    }

    const restoredPath = await restoreFromTrash(trashItemPath);
    const vaultRoot = getVaultRoot();
    const relPath = restoredPath.startsWith(vaultRoot) ? restoredPath.slice(vaultRoot.length + 1) : restoredPath;

    return {
        content: [{ type: "text" as const, text: `Restored ".trash/${path}" to "${relPath.replace(/\\/g, "/")}".` }],
    };
}
