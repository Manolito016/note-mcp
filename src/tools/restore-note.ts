import { getVaultRoot } from "../utils/vault.js";
import { safeTrashSource, safeRestoreDestination, restoreFromTrash } from "../utils/trash.js";
import { relative } from "node:path";
import * as z from "zod";
import { scheduleHiveRegen } from "./hive-auto-regen.js";

export const name = "restore_note";
export const description =
    "Restore a note or folder from the trash back to its original location. Use list_trash first to see available items.";
export const inputSchema = z.object({
    path: z.string().describe("Path of the item inside .trash/ (e.g., 'knowledge/my-note.md')"),
});

export async function handler({ path }: { path: string }) {
    // Validate the source path is safely inside .trash (traversal, symlink, absolute checks)
    const trashItemPath = await safeTrashSource(path);

    // Validate the restore destination is safely inside the vault
    await safeRestoreDestination(path);

    // Perform the restore (restoreFromTrash also validates internally)
    const restoredPath = await restoreFromTrash(trashItemPath);

    const vaultRoot = getVaultRoot();
    const relPath = relative(vaultRoot, restoredPath).replace(/\\/g, "/");
    scheduleHiveRegen(relPath);

    return {
        content: [{ type: "text" as const, text: `Restored ".trash/${path}" to "${relPath}".` }],
    };
}
