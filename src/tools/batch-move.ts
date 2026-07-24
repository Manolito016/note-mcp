import { rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import * as z from "zod";

export const name = "batch_move";
export const description = "Move multiple notes at once. Returns success/failure for each file.";
export const inputSchema = z.object({
    moves: z
        .array(
            z.object({
                from: z.string().describe("Source path"),
                to: z.string().describe("Destination path"),
            }),
        )
        .describe("Array of move operations"),
});

export async function handler({ moves }: { moves: { from: string; to: string }[] }) {
    const results: { from: string; to: string; success: boolean; message: string }[] = [];

    for (const { from, to } of moves) {
        try {
            const srcPath = resolveVaultPath(from);
            const destPath = resolveVaultPath(to);

            if (!(await pathExists(srcPath))) {
                results.push({ from, to, success: false, message: "Source not found" });
                continue;
            }

            if (await pathExists(destPath)) {
                results.push({ from, to, success: false, message: "Destination already exists" });
                continue;
            }

            await mkdir(dirname(destPath), { recursive: true });
            await rename(srcPath, destPath);
            results.push({ from, to, success: true, message: "Moved" });
        } catch (err) {
            results.push({ from, to, success: false, message: err instanceof Error ? err.message : "Unknown error" });
        }
    }

    const successCount = results.filter((r) => r.success).length;
    const summary = `Moved ${successCount}/${moves.length} files.`;

    return {
        content: [{ type: "text" as const, text: `${summary}\n\nDetails:\n${results.map((r) => `  ${r.success ? "✓" : "✗"} ${r.from} → ${r.to}: ${r.message}`).join("\n")}` }],
    };
}
