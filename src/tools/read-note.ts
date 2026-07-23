import { readFile } from "node:fs/promises";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import * as z from "zod";

export const name = "read_note";
export const description = "Read the content of a note by its path relative to the vault root.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note file, relative to the vault root (e.g. 'daily/2026-07-23.md')"),
});

export async function handler({ path }: { path: string }) {
    const fullPath = resolveVaultPath(path);

    if (!(await pathExists(fullPath))) {
        return { content: [{ type: "text" as const, text: `Error: Note not found at "${path}".` }], isError: true };
    }

    const content = await readFile(fullPath, "utf-8");
    return { content: [{ type: "text" as const, text: content }] };
}
