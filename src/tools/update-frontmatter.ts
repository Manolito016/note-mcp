import { readFile, writeFile } from "node:fs/promises";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import { parseFrontmatter, stringifyFrontmatter } from "../utils/frontmatter.js";
import * as z from "zod";

export const name = "update_frontmatter";
export const description = "Update specific keys in YAML frontmatter while preserving existing keys and content.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note file, relative to the vault root"),
    updates: z.record(z.unknown()).describe("Frontmatter key-value pairs to update or add"),
});

export async function handler({ path, updates }: { path: string; updates: Record<string, unknown> }) {
    const fullPath = resolveVaultPath(path);

    if (!(await pathExists(fullPath))) {
        return { content: [{ type: "text" as const, text: `Error: Note not found at "${path}".` }], isError: true };
    }

    const content = await readFile(fullPath, "utf-8");
    const { frontmatter: existingFrontmatter, content: bodyContent } = parseFrontmatter(content);
    
    // Merge existing frontmatter with updates
    const mergedFrontmatter = { ...existingFrontmatter, ...updates };
    const newFrontmatter = stringifyFrontmatter(mergedFrontmatter);
    const newContent = newFrontmatter + bodyContent;

    await writeFile(fullPath, newContent, "utf-8");

    return { content: [{ type: "text" as const, text: `Frontmatter updated in "${path}". ${Object.keys(updates).length} key(s) updated.` }] };
}
