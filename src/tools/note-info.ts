import { resolveVaultPath, pathExists, getPathStats } from "../utils/vault.js";
import * as z from "zod";

export const name = "note_info";
export const description = "Get metadata for a note or folder (size, created date, modified date).";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note or folder, relative to the vault root"),
});

export async function handler({ path }: { path: string }) {
    const fullPath = resolveVaultPath(path);

    if (!(await pathExists(fullPath))) {
        return { content: [{ type: "text" as const, text: `Error: Path not found: "${path}".` }], isError: true };
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
