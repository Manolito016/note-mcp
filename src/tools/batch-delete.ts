import { unlink } from "node:fs/promises";
import { pathExists, safeDeleteTarget } from "../utils/vault.js";
import { moveToTrash } from "../utils/trash.js";
import * as z from "zod";
import { scheduleHiveRegen } from "./hive-auto-regen.js";

export const name = "batch_delete";
export const description =
    "Delete multiple notes at once. By default, moves to .trash/ (recoverable). Set permanent=true to delete immediately. " +
    "Returns success/failure for each file. Supports dry-run preview.";
export const inputSchema = z.object({
    paths: z.array(z.string()).describe("Array of note paths to delete, relative to the vault root"),
    permanent: z
        .boolean()
        .default(false)
        .describe("If true, delete immediately without moving to trash (default: false)"),
    dry_run: z.boolean().default(false).describe("If true, preview what would be deleted without actually deleting"),
});

export async function handler({
    paths,
    permanent,
    dry_run,
}: {
    paths: string[];
    permanent: boolean;
    dry_run: boolean;
}) {
    const results: { path: string; success: boolean; message: string }[] = [];

    for (const path of paths) {
        try {
            // Centralized safety check per file
            const fullPath = await safeDeleteTarget(path);

            if (!(await pathExists(fullPath))) {
                results.push({ path, success: false, message: "File not found" });
                continue;
            }

            if (dry_run) {
                results.push({
                    path,
                    success: true,
                    message: permanent ? "Would permanently delete" : "Would move to trash",
                });
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
    const mode = dry_run ? "[DRY RUN] would be " : permanent ? "permanently deleted" : "moved to trash";
    const summary = `${successCount}/${paths.length} files ${mode}.`;

    if (successCount > 0 && !dry_run) scheduleHiveRegen(paths[0]);
    return {
        content: [
            {
                type: "text" as const,
                text: `${summary}\n\nDetails:\n${results.map((r) => `  ${r.success ? "+" : "-"} ${r.path}: ${r.message}`).join("\n")}`,
            },
        ],
    };
}
