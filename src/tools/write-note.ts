import { writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { pathExists, safeWriteTarget } from "../utils/vault.js";
import { recordMutation } from "../utils/session-tracker.js";
import { scheduleHiveRegen } from "./hive-auto-regen.js";
import { validateContentSize } from "../utils/errors.js";
import * as z from "zod";

export const name = "write_note";
export const description =
    "Create or overwrite a note at the given path. Creates parent directories if needed. Auto-appends .md if no file extension is provided. " +
    "Supports create_if_missing (upsert) and optimistic locking via expected_modified.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note file, relative to the vault root (.md appended if no extension)"),
    content: z.string().describe("The full content to write to the note"),
    create_if_missing: z
        .boolean()
        .default(true)
        .describe("If true, create the note if it doesn't exist (upsert behavior, default: true)"),
    expected_modified: z
        .string()
        .optional()
        .describe(
            "ISO timestamp of when you last read the file. If the file was modified after this, the write is rejected (optimistic locking).",
        ),
});

export async function handler({
    path,
    content,
    create_if_missing,
    expected_modified,
}: {
    path: string;
    content: string;
    create_if_missing: boolean;
    expected_modified?: string;
}) {
    // Validate content size before any filesystem operations
    const sizeError = validateContentSize(content);
    if (sizeError) {
        return { content: [{ type: "text" as const, text: `Error: ${sizeError.message}` }], isError: true };
    }

    // Auto-append .md if no file extension is present
    const resolvedPath = extname(path) ? path : `${path}.md`;
    const fullPath = await safeWriteTarget(resolvedPath);
    const exists = await pathExists(fullPath);

    // If file doesn't exist and create_if_missing is false, fail
    if (!exists && create_if_missing === false) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: `Error: Note not found at "${resolvedPath}". Set create_if_missing: true to create it, or use create_note.`,
                },
            ],
            isError: true,
        };
    }

    // Optimistic locking: check if file was modified since last read
    if (exists && expected_modified) {
        try {
            const fileStat = await stat(fullPath);
            const actualModified = new Date(fileStat.mtimeMs).toISOString();
            if (actualModified > expected_modified) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text:
                                `Error: File "${resolvedPath}" was modified since you last read it (actual: ${actualModified}, expected: ${expected_modified}). ` +
                                `Re-read the file and try again to avoid overwriting changes.`,
                        },
                    ],
                    isError: true,
                };
            }
        } catch {
            // If stat fails, proceed with write
        }
    }

    const isUpdate = exists;
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
    await recordMutation({ type: isUpdate ? "update" : "create", path: resolvedPath });
    scheduleHiveRegen(resolvedPath);

    const action = isUpdate ? "written to" : "created at";
    return { content: [{ type: "text" as const, text: `Note ${action} "${resolvedPath}".` }] };
}
