import * as z from "zod";
import { knowledgeIndex } from "../utils/knowledge-index.js";

export const name = "refresh_knowledge_index";
export const description =
    "Rebuild Quill's lightweight discovery index from the configured vault (recovery/administration operation).";
export const inputSchema = z.object({});
export async function handler() {
    const result = await knowledgeIndex.refresh();
    return { content: [{ type: "text" as const, text: JSON.stringify({ refreshed: true, ...result }) }] };
}
