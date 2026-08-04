import { unlink } from "node:fs/promises";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import { moveToTrash } from "../utils/trash.js";
import * as z from "zod";

export const name = "batch_delete";
export const description =
    "Delete multiple notes at once. By default, moves to .trash/ (recoverable). Set permanent=true to delete immediately. Returns success/failure for each file.";
export const inputSchema = z.object({
    paths: z.array(z.string()).describe("Array of note paths to delete, relative to the vault root"),
    permanent: z.boolean().default(false).describe("If true, delete immediately without moving to trash (default: false)"),
});

export async function handler({ paths, permanent }: { paths: string[]; permanent: boolean }) {
    const results: { path: string; success: boolean; message: string }[] = [];

    for (const path of paths) {
        try {
            const fullPath = resolveVaultPath(path);

            if (!(await pathExists(fullPath))) {
                results.push({ path, success: false, message: "File not found" });
                continue;
            }

            if (permanent) {
                await unlink(fullPath);
                results.push({ path, success: true, message: "Permanently deleted" });
            } else {
                await moveToTrash(fullPath);
                results.push({ path, success: true, message: "Moved to trash" });
            }
        } catch (err) {
            results.push({ path, success: false, message: err instanceof Error ? err.message : "Unknown error" });
        }
    }

    const successCount = results.filter((r) => r.success).length;
    const mode = permanent ? "permanently deleted" : "moved to trash";
    const summary = `${successCount}/${paths.length} files ${mode}.`;

    return {
        content: [
            {
                type: "text" as const,
                text: `${summary}\n\nDetails:\n${results.map((r) => `  ${r.success ? "+" : "-"} ${r.path}: ${r.message}`).join("\n")}`,
            },
        ],
    };
}
