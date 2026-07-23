import { mkdir } from "node:fs/promises";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import * as z from "zod";

export const name = "create_folder";
export const description = "Create a new folder in the vault. Creates parent directories if needed.";
export const inputSchema = z.object({
    path: z.string().describe("Path for the new folder, relative to the vault root"),
});

export async function handler({ path }: { path: string }) {
    const fullPath = resolveVaultPath(path);

    if (await pathExists(fullPath)) {
        return { content: [{ type: "text" as const, text: `Folder already exists at "${path}".` }] };
    }

    await mkdir(fullPath, { recursive: true });
    return { content: [{ type: "text" as const, text: `Folder created: "${path}".` }] };
}
