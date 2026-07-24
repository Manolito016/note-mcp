import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveVaultPath } from "../utils/vault.js";
import * as z from "zod";

export const name = "write_note";
export const description = "Create or overwrite a note at the given path. Creates parent directories if needed.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note file, relative to the vault root"),
    content: z.string().describe("The full content to write to the note"),
});

export async function handler({ path, content }: { path: string; content: string }) {
    const fullPath = resolveVaultPath(path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
    return { content: [{ type: "text" as const, text: `Note written to "${path}".` }] };
}
