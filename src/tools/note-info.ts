import { resolveVaultPath, pathExists, getPathStats, safeReadTarget, assertWithinVault } from "../utils/vault.js";
import { extname } from "node:path";
import * as z from "zod";

export const name = "note_info";
export const description =
    "Get metadata for a note or folder (size, created date, modified date). Auto-appends .md if no file extension is provided.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note or folder, relative to the vault root (.md appended if no extension)"),
});

export async function handler({ path }: { path: string }) {
    // Auto-append .md if no file extension is present (skip for directories)
    const resolvedPath = extname(path) ? path : `${path}.md`;
    let fullPath: string;
    try {
        fullPath = await safeReadTarget(resolvedPath);
    } catch {
        // Fallback: try original path (might be a directory)
        fullPath = resolveVaultPath(path);
        if (!(await pathExists(fullPath))) {
            return { content: [{ type: "text" as const, text: `Error: Path not found: "${path}".` }], isError: true };
        }
        await assertWithinVault(fullPath);
    }

    const stats = await getPathStats(fullPath);
    const info = {
        path,
        type: stats.isDirectory ? "directory" : "file",
        sizeBytes: stats.size,
        created: stats.created,
        modified: stats.modified,
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }] };
}
