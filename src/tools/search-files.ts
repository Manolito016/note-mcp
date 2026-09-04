import * as z from "zod";
import { basename } from "node:path";
import { knowledgeIndex, normalizeVaultRelativePath } from "../utils/knowledge-index.js";
import { boundedLimit, decodeCursor, encodeCursor } from "../utils/pagination.js";

export const name = "search_files";
export const description =
    "Search indexed filenames, optionally paths, using case-insensitive substring or safe glob matching without reading file bodies.";
export const inputSchema = z.object({
    pattern: z.string().min(1),
    folder: z.string().default("."),
    match: z.enum(["substring", "glob"]).default("substring"),
    recursive: z.boolean().default(true),
    include_path_matches: z.boolean().default(true),
    limit: z.number().int().positive().max(200).default(100),
    cursor: z.string().optional(),
});

export function globToRegExp(pattern: string): RegExp {
    if (pattern.length > 512 || pattern.includes("\0")) throw new Error("Invalid glob pattern.");
    let source = "";
    for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i];
        if (char === "*") source += "[^/]*";
        else if (char === "?") source += "[^/]";
        else if (char === "[") {
            const end = pattern.indexOf("]", i + 1);
            if (end < 0) throw new Error("Invalid glob pattern: unclosed character class.");
            const cls = pattern.slice(i + 1, end);
            if (!cls || /[\\/]/.test(cls)) throw new Error("Invalid glob character class.");
            source += `[${cls.replace(/^!/, "^")}]`;
            i = end;
        } else source += char.replace(/[\\^$+.()|{}]/g, "\\$&");
    }
    return new RegExp(`^${source}$`, "iu");
}

export async function handler({
    pattern,
    folder = ".",
    match = "substring",
    recursive = true,
    include_path_matches = true,
    limit = 100,
    cursor,
}: {
    pattern: string;
    folder?: string;
    match?: "substring" | "glob";
    recursive?: boolean;
    include_path_matches?: boolean;
    limit?: number;
    cursor?: string;
}) {
    const safeFolder = normalizeVaultRelativePath(folder);
    await knowledgeIndex.ensureSynchronized();
    const prefix = safeFolder === "." ? "" : `${safeFolder}/`;
    const needle = pattern.normalize("NFKC").toLocaleLowerCase();
    const regex = match === "glob" ? globToRegExp(pattern) : undefined;
    const results = knowledgeIndex
        .getEntries(safeFolder)
        .filter((entry) => {
            if (!recursive && entry.path.slice(prefix.length).includes("/")) return false;
            const targets = include_path_matches ? [entry.filename, entry.path] : [entry.filename];
            return targets.some((target) =>
                regex
                    ? regex.test(match === "glob" && target.includes("/") ? target : basename(target))
                    : target.normalize("NFKC").toLocaleLowerCase().includes(needle),
            );
        })
        .map((entry) => ({ path: entry.path, filename: entry.filename, size: entry.size, modified: entry.modified }));
    const offset = decodeCursor(cursor);
    const take = boundedLimit(limit, 100);
    const page = results.slice(offset, offset + take);
    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify({
                    pattern,
                    count: page.length,
                    total: results.length,
                    results: page,
                    next_cursor: offset + page.length < results.length ? encodeCursor(offset + page.length) : null,
                }),
            },
        ],
    };
}
