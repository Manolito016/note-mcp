import * as z from "zod";
import { knowledgeIndex, normalizeVaultRelativePath } from "../utils/knowledge-index.js";
import { boundedLimit, decodeCursor, encodeCursor } from "../utils/pagination.js";

export const name = "search_by_tag";
export const description = "Find Markdown resources by normalized YAML frontmatter tags using AND or OR logic.";
export const inputSchema = z.object({
    tags: z.array(z.string().min(1)).min(1),
    operator: z.enum(["AND", "OR"]).default("OR"),
    folder: z.string().default("."),
    limit: z.number().int().positive().max(200).default(100),
    cursor: z.string().optional(),
});

export async function handler({
    tags,
    operator = "OR",
    folder = ".",
    limit = 100,
    cursor,
}: {
    tags: string[];
    operator?: "AND" | "OR";
    folder?: string;
    limit?: number;
    cursor?: string;
}) {
    const safeFolder = normalizeVaultRelativePath(folder);
    await knowledgeIndex.ensureSynchronized();
    const wanted = [
        ...new Set(
            tags.map((tag) => tag.trim().replace(/^#/, "").normalize("NFKC").toLocaleLowerCase()).filter(Boolean),
        ),
    ];
    const results = knowledgeIndex
        .getEntries(safeFolder)
        .filter((entry) => {
            const actual = new Set(entry.tags.map((tag) => tag.normalize("NFKC").toLocaleLowerCase()));
            return operator === "AND" ? wanted.every((tag) => actual.has(tag)) : wanted.some((tag) => actual.has(tag));
        })
        .map((entry) => ({
            path: entry.path,
            filename: entry.filename,
            title: entry.title,
            tags: entry.tags,
            aliases: entry.aliases,
        }));
    const offset = decodeCursor(cursor);
    const take = boundedLimit(limit, 100);
    const page = results.slice(offset, offset + take);
    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify({
                    tags: wanted,
                    operator,
                    count: page.length,
                    total: results.length,
                    results: page,
                    next_cursor: offset + page.length < results.length ? encodeCursor(offset + page.length) : null,
                }),
            },
        ],
    };
}
