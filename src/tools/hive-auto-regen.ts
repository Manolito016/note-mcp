/**
 * Debounced auto-regeneration for the hive canvas JSON.
 *
 * When a vault knowledge file is written, the canvas is
 * regenerated after a short debounce window so the visualisation
 * stays in sync without blocking the write response.
 */

import { generateCanvas } from "./generate-hive-canvas.js";
import { knowledgeIndex } from "../utils/knowledge-index.js";
import { logger } from "../utils/logger.js";

let timer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 3_000;
const CANVAS_ROOTS = ["README.md", "knowledge/", "notes/", "memories/", "projects/", "solutions/", "plugin/"];

/**
 * Schedule a hive canvas regeneration.
 * Multiple calls within the debounce window collapse into one run.
 * Only triggers when the written path belongs to a canvas source root.
 */
export function scheduleHiveRegen(writtenPath: string): void {
    // Every built-in vault mutation passes through this hook. Discovery will
    // reconcile the affected filesystem state before its next indexed lookup.
    knowledgeIndex.markDirty();
    if (!CANVAS_ROOTS.some((root) => (root.endsWith("/") ? writtenPath.startsWith(root) : writtenPath === root)))
        return;

    if (timer) clearTimeout(timer);

    timer = setTimeout(async () => {
        timer = null;
        try {
            const result = await generateCanvas();
            logger.info("hive canvas auto-regenerated", {
                nodes: result.nodes,
                links: result.links,
                warnings: result.warnings,
            });
        } catch (err) {
            logger.error("hive auto-regen failed", { error: (err as Error).message });
        }
    }, DEBOUNCE_MS);
    timer.unref?.();
}

export function cancelHiveRegen(): void {
    if (timer) clearTimeout(timer);
    timer = null;
}
