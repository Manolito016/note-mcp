import { readFile } from "node:fs/promises";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import { parseFrontmatter } from "../utils/frontmatter.js";
import * as z from "zod";

export const name = "read_frontmatter";
export const description = "Read and parse YAML frontmatter from a note.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note file, relative to the vault root"),
});

export async function handler({ path }: { path: string }) {
    const fullPath = resolveVaultPath(path);

    if (!(await pathExists(fullPath))) {
        return { content: [{ type: "text" as const, text: `Error: Note not found at "${path}".` }], isError: true };
    }

    const content = await readFile(fullPath, "utf-8");
    const { frontmatter } = parseFrontmatter(content);

    if (Object.keys(frontmatter).length === 0) {
        return { content: [{ type: "text" as const, text: `No frontmatter found in "${path}".` }] };
    }

    return {
        content: [{ type: "text" as const, text: `Frontmatter for "${path}":\n${JSON.stringify(frontmatter, null, 2)}` }],
    };
}
