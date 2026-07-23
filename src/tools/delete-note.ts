import { unlink } from "node:fs/promises";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import * as z from "zod";

export const name = "delete_note";
export const description = "Delete a note file from the vault.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note file to delete, relative to the vault root"),
});

export async function handler({ path }: { path: string }) {
    const fullPath = resolveVaultPath(path);

    if (!(await pathExists(fullPath))) {
        return { content: [{ type: "text" as const, text: `Error: Note not found at "${path}".` }], isError: true };
    }

    await unlink(fullPath);
    return { content: [{ type: "text" as const, text: `Note deleted: "${path}".` }] };
}
