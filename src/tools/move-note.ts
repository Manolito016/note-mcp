import { rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathExists, safeDeleteTarget, safeWriteTarget } from "../utils/vault.js";
import * as z from "zod";
import { scheduleHiveRegen } from "./hive-auto-regen.js";

export const name = "move_note";
export const description = "Move or rename a note within the vault.";
export const inputSchema = z.object({
    from: z.string().describe("Current path of the note, relative to the vault root"),
    to: z.string().describe("New path for the note, relative to the vault root"),
});

export async function handler({ from, to }: { from: string; to: string }) {
    const srcPath = await safeDeleteTarget(from);
    const destPath = await safeWriteTarget(to);

    if (!(await pathExists(srcPath))) {
        return {
            content: [{ type: "text" as const, text: `Error: Source note not found at "${from}".` }],
            isError: true,
        };
    }

    if (await pathExists(destPath)) {
        return {
            content: [{ type: "text" as const, text: `Error: A file already exists at "${to}".` }],
            isError: true,
        };
    }

    await mkdir(dirname(destPath), { recursive: true });
    await rename(srcPath, destPath);
    scheduleHiveRegen(to);
    return { content: [{ type: "text" as const, text: `Note moved from "${from}" to "${to}".` }] };
}
