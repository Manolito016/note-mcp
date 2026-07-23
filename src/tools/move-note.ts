import { rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import * as z from "zod";

export const name = "move_note";
export const description = "Move or rename a note within the vault.";
export const inputSchema = z.object({
    from: z.string().describe("Current path of the note, relative to the vault root"),
    to: z.string().describe("New path for the note, relative to the vault root"),
});

export async function handler({ from, to }: { from: string; to: string }) {
    const srcPath = resolveVaultPath(from);
    const destPath = resolveVaultPath(to);

    if (!(await pathExists(srcPath))) {
        return { content: [{ type: "text" as const, text: `Error: Source note not found at "${from}".` }], isError: true };
    }

    if (await pathExists(destPath)) {
        return { content: [{ type: "text" as const, text: `Error: A file already exists at "${to}".` }], isError: true };
    }

    await mkdir(dirname(destPath), { recursive: true });
    await rename(srcPath, destPath);
    return { content: [{ type: "text" as const, text: `Note moved from "${from}" to "${to}".` }] };
}
