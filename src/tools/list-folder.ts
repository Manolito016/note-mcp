import * as z from "zod";
import { basename } from "node:path";
import { knowledgeIndex, normalizeVaultRelativePath } from "../utils/knowledge-index.js";
import { boundedLimit, decodeCursor, encodeCursor } from "../utils/pagination.js";

export const name = "list_folder";
export const description =
    "Browse a vault folder with bounded, cursor-paginated file/folder metadata without loading full document bodies.";
export const inputSchema = z.object({
    folder: z.string().default("."),
    recursive: z.boolean().default(false),
    include_metadata: z.boolean().default(true),
    limit: z.number().int().positive().max(200).default(100),
    cursor: z.string().optional(),
});

export async function handler({
    folder = ".",
    recursive = false,
    include_metadata = true,
    limit = 100,
    cursor,
}: {
    folder?: string;
    recursive?: boolean;
    include_metadata?: boolean;
    limit?: number;
    cursor?: string;
}) {
    const safeFolder = normalizeVaultRelativePath(folder);
    await knowledgeIndex.ensureSynchronized();
    const prefix = safeFolder === "." ? "" : `${safeFolder}/`;
    const files = knowledgeIndex
        .getEntries(safeFolder)
        .filter((entry) => recursive || !entry.path.slice(prefix.length).includes("/"))
        .map((entry) =>
            include_metadata
                ? {
                      name: entry.filename,
                      path: entry.path,
                      type: "file",
                      title: entry.title,
                      tags: entry.tags,
                      aliases: entry.aliases,
                      size: entry.size,
                      modified: entry.modified,
                  }
                : { name: entry.filename, path: entry.path, type: "file" },
        );
    const folders = knowledgeIndex.getFolders(safeFolder, recursive).map((path) => ({
        name: basename(path),
        path,
        type: "folder",
        child_count: knowledgeIndex.getEntries(path).length + knowledgeIndex.getFolders(path, false).length,
    }));
    const all = [...folders, ...files].sort((a, b) => a.path.localeCompare(b.path, "en"));
    const offset = decodeCursor(cursor);
    const take = boundedLimit(limit, 100);
    const page = all.slice(offset, offset + take);
    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify({
                    folder: safeFolder,
                    count: page.length,
                    total: all.length,
                    entries: page,
                    next_cursor: offset + page.length < all.length ? encodeCursor(offset + page.length) : null,
                }),
            },
        ],
    };
}
