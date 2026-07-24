import { unlink } from "node:fs/promises";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import * as z from "zod";

export const name = "batch_delete";
export const description = "Delete multiple notes at once. Returns success/failure for each file.";
export const inputSchema = z.object({
    paths: z.array(z.string()).describe("Array of note paths to delete, relative to the vault root"),
});

export async function handler({ paths }: { paths: string[] }) {
    const results: { path: string; success: boolean; message: string }[] = [];

    for (const path of paths) {
        try {
            const fullPath = resolveVaultPath(path);

            if (!(await pathExists(fullPath))) {
                results.push({ path, success: false, message: "File not found" });
                continue;
            }

            await unlink(fullPath);
            results.push({ path, success: true, message: "Deleted" });
        } catch (err) {
            results.push({ path, success: false, message: err instanceof Error ? err.message : "Unknown error" });
        }
    }

    const successCount = results.filter((r) => r.success).length;
    const summary = `Deleted ${successCount}/${paths.length} files.`;

    return {
        content: [{ type: "text" as const, text: `${summary}\n\nDetails:\n${results.map((r) => `  ${r.success ? "✓" : "✗"} ${r.path}: ${r.message}`).join("\n")}` }],
    };
}
