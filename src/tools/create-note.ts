import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import * as z from "zod";

export const name = "create_note";
export const description = "Create a new note. Fails if the file already exists.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the new note file, relative to the vault root"),
    content: z.string().describe("The initial content for the note"),
});

export async function handler({ path, content }: { path: string; content: string }) {
    const fullPath = resolveVaultPath(path);

    if (await pathExists(fullPath)) {
        return { content: [{ type: "text" as const, text: `Error: Note already exists at "${path}". Use write_note to overwrite.` }], isError: true };
    }

    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
    return { content: [{ type: "text" as const, text: `Note created at "${path}".` }] };
}
