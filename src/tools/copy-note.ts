import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathExists, safeReadTarget, safeWriteTarget } from "../utils/vault.js";
import * as z from "zod";
import { scheduleHiveRegen } from "./hive-auto-regen.js";

export const name = "copy_note";
export const description = "Copy a note to a new location within the vault.";
export const inputSchema = z.object({
    from: z.string().describe("Source path of the note to copy, relative to the vault root"),
    to: z.string().describe("Destination path for the copy, relative to the vault root"),
});

export async function handler({ from, to }: { from: string; to: string }) {
    const srcPath = await safeReadTarget(from);
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
    await copyFile(srcPath, destPath);
    scheduleHiveRegen(to);
    return { content: [{ type: "text" as const, text: `Note copied from "${from}" to "${to}".` }] };
}
