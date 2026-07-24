import { rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveVaultPath, pathExists, getPathStats } from "../utils/vault.js";
import * as z from "zod";

export const name = "rename_folder";
export const description = "Rename a folder in the vault.";
export const inputSchema = z.object({
    from: z.string().describe("Current folder path, relative to the vault root"),
    to: z.string().describe("New folder path, relative to the vault root"),
});

export async function handler({ from, to }: { from: string; to: string }) {
    const srcPath = resolveVaultPath(from);
    const destPath = resolveVaultPath(to);

    if (!(await pathExists(srcPath))) {
        return { content: [{ type: "text" as const, text: `Error: Folder not found at "${from}".` }], isError: true };
    }

    const stats = await getPathStats(srcPath);
    if (!stats.isDirectory) {
        return { content: [{ type: "text" as const, text: `Error: Path is not a folder: "${from}".` }], isError: true };
    }

    if (await pathExists(destPath)) {
        return { content: [{ type: "text" as const, text: `Error: A folder already exists at "${to}".` }], isError: true };
    }

    await mkdir(dirname(destPath), { recursive: true });
    await rename(srcPath, destPath);
    return { content: [{ type: "text" as const, text: `Folder renamed from "${from}" to "${to}".` }] };
}
