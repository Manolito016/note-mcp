import { listTrash } from "../utils/trash.js";
import * as z from "zod";

export const name = "list_trash";
export const description = "List all items currently in the trash (.trash/). Shows path and deletion time for each item.";
export const inputSchema = z.object({});

export async function handler() {
    const items = await listTrash();

    if (items.length === 0) {
        return { content: [{ type: "text" as const, text: "Trash is empty." }] };
    }

    const lines = items.map((item) => {
        const deletedDate = new Date(item.deletedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
        return `  ${item.isFile ? "[FILE]" : "[DIR] "} .trash/${item.path}  (deleted: ${deletedDate})`;
    });

    return {
        content: [{ type: "text" as const, text: `Trash contains ${items.length} item(s):\n\n${lines.join("\n")}` }],
    };
}
