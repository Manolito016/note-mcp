import { appendFile } from "node:fs/promises";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import * as z from "zod";

export const name = "append_note";
export const description = "Append content to an existing note. Fails if the note doesn't exist.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note file, relative to the vault root"),
    content: z.string().describe("The content to append to the note"),
});

export async function handler({ path, content }: { path: string; content: string }) {
    const fullPath = resolveVaultPath(path);

    if (!(await pathExists(fullPath))) {
        return { content: [{ type: "text" as const, text: `Error: Note not found at "${path}".` }], isError: true };
    }

    await appendFile(fullPath, content, "utf-8");
    return { content: [{ type: "text" as const, text: `Content appended to "${path}".` }] };
}
