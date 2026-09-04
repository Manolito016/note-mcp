import { appendFile, readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { pathExists, safeWriteTarget } from "../utils/vault.js";
import { scheduleHiveRegen } from "./hive-auto-regen.js";
import { validateContentSize } from "../utils/errors.js";
import * as z from "zod";

export const name = "append_note";
export const description =
    "Append content to an existing note. Fails if the note doesn't exist. Auto-appends .md if no file extension is provided. " +
    "Supports prepend mode, section-based insertion (before/after a heading), and auto-newline separation.";
export const inputSchema = z.object({
    path: z.string().describe("Path to the note file, relative to the vault root (.md appended if no extension)"),
    content: z.string().describe("The content to append to the note"),
    prepend: z.boolean().default(false).describe("If true, add content at the top instead of the bottom"),
    after_heading: z
        .string()
        .optional()
        .describe("Insert content after this heading text (e.g. 'Tasks' inserts after ## Tasks)"),
    before_heading: z.string().optional().describe("Insert content before this heading text"),
    auto_newline: z
        .boolean()
        .default(true)
        .describe("If true, ensure proper newline separation before/after appended content"),
});

export async function handler({
    path,
    content,
    prepend,
    after_heading,
    before_heading,
    auto_newline,
}: {
    path: string;
    content: string;
    prepend: boolean;
    after_heading?: string;
    before_heading?: string;
    auto_newline: boolean;
}) {
    // Validate content size
    const sizeError = validateContentSize(content);
    if (sizeError) {
        return { content: [{ type: "text" as const, text: `Error: ${sizeError.message}` }], isError: true };
    }

    // Auto-append .md if no file extension is present
    const resolvedPath = extname(path) ? path : `${path}.md`;
    const fullPath = await safeWriteTarget(resolvedPath);

    if (!(await pathExists(fullPath))) {
        return {
            content: [{ type: "text" as const, text: `Error: Note not found at "${resolvedPath}".` }],
            isError: true,
        };
    }

    // Section-based insertion
    if (after_heading || before_heading) {
        const fullContent = await readFile(fullPath, "utf-8");
        const lines = fullContent.split("\n");
        const targetHeading = (after_heading ?? before_heading)!.trim();
        const headingPattern = new RegExp(`^#{1,6}\\s+${escapeRegex(targetHeading)}\\s*$`);

        let targetLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (headingPattern.test(lines[i].trim())) {
                targetLineIndex = i;
                break;
            }
        }

        if (targetLineIndex === -1) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Error: Heading "${targetHeading}" not found in "${resolvedPath}".`,
                    },
                ],
                isError: true,
            };
        }

        let insertIndex: number;
        if (after_heading) {
            // Find the end of the heading's section (next heading of same or higher level, or end of file)
            const headingLevel = lines[targetLineIndex].match(/^(#{1,6})/)?.[1].length ?? 1;
            insertIndex = targetLineIndex + 1;
            // Skip blank lines right after heading
            while (insertIndex < lines.length && lines[insertIndex].trim() === "") {
                insertIndex++;
            }
            // Find next heading of same or higher level
            for (let i = insertIndex; i < lines.length; i++) {
                const level = lines[i].match(/^(#{1,6})/)?.[1].length ?? 0;
                if (level > 0 && level <= headingLevel) {
                    insertIndex = i;
                    break;
                }
                insertIndex = i + 1;
            }
        } else {
            // before_heading: insert right before the heading line
            insertIndex = targetLineIndex;
        }

        let insertContent = content;
        if (auto_newline) {
            if (!insertContent.endsWith("\n")) insertContent += "\n";
        }

        lines.splice(insertIndex, 0, insertContent);
        await writeFile(fullPath, lines.join("\n"), "utf-8");
        scheduleHiveRegen(resolvedPath);
        const location = after_heading ? `after heading "${after_heading}"` : `before heading "${before_heading}"`;
        return { content: [{ type: "text" as const, text: `Content inserted ${location} in "${resolvedPath}".` }] };
    }

    // Prepend mode
    if (prepend) {
        const existing = await readFile(fullPath, "utf-8");
        let insertContent = content;
        if (auto_newline) {
            if (!insertContent.endsWith("\n")) insertContent += "\n";
            if (!existing.startsWith("\n")) insertContent += "\n";
        }
        await writeFile(fullPath, insertContent + existing, "utf-8");
        scheduleHiveRegen(resolvedPath);
        return { content: [{ type: "text" as const, text: `Content prepended to "${resolvedPath}".` }] };
    }

    // Normal append (with auto-newline)
    if (auto_newline) {
        const existing = await readFile(fullPath, "utf-8");
        let separator = "";
        if (existing.length > 0 && !existing.endsWith("\n")) {
            separator = "\n";
        }
        let insertContent = content;
        if (!insertContent.startsWith("\n") && separator === "") {
            separator = "\n";
        }
        await appendFile(fullPath, separator + insertContent, "utf-8");
    } else {
        await appendFile(fullPath, content, "utf-8");
    }

    scheduleHiveRegen(resolvedPath);
    return { content: [{ type: "text" as const, text: `Content appended to "${resolvedPath}".` }] };
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
