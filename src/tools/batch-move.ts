import { rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathExists, safeDeleteTarget, safeWriteTarget } from "../utils/vault.js";
import * as z from "zod";
import { scheduleHiveRegen } from "./hive-auto-regen.js";

export const name = "batch_move";
export const description =
    "Move multiple notes at once. Returns success/failure for each file. Supports dry-run preview.";
export const inputSchema = z.object({
    moves: z
        .array(
            z.object({
                from: z.string().describe("Source path"),
                to: z.string().describe("Destination path"),
            }),
        )
        .describe("Array of move operations"),
    dry_run: z.boolean().default(false).describe("If true, preview what would be moved without actually moving"),
});

export async function handler({ moves, dry_run }: { moves: { from: string; to: string }[]; dry_run: boolean }) {
    const results: { from: string; to: string; success: boolean; message: string }[] = [];

    for (const { from, to } of moves) {
        try {
            // Centralized safety checks
            const srcPath = await safeDeleteTarget(from);
            const destPath = await safeWriteTarget(to);

            if (!(await pathExists(srcPath))) {
                results.push({ from, to, success: false, message: "Source not found" });
                continue;
            }

            if (await pathExists(destPath)) {
                results.push({ from, to, success: false, message: "Destination already exists" });
                continue;
            }

            if (dry_run) {
                results.push({ from, to, success: true, message: "Would move" });
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
    const prefix = dry_run ? "[DRY RUN] " : "";
    const summary = `${prefix}Moved ${successCount}/${moves.length} files.`;

    if (successCount > 0 && !dry_run) scheduleHiveRegen(moves[0].to);
    return {
        content: [
            {
                type: "text" as const,
                text: `${summary}\n\nDetails:\n${results.map((r) => `  ${r.success ? "✓" : "✗"} ${r.from} → ${r.to}: ${r.message}`).join("\n")}`,
            },
        ],
    };
}
