import { getVaultRoot, pathExists, getPathStats } from "../utils/vault.js";
import * as z from "zod";

export const name = "vault_status";
export const description = "Check the vault status and basic statistics (exists, accessible, file count).";
export const inputSchema = z.object({});

export async function handler() {
    const vaultPath = getVaultRoot();
    const exists = await pathExists(vaultPath);

    if (!exists) {
        return {
            content: [{ type: "text" as const, text: JSON.stringify({ status: "error", message: "Vault path does not exist", path: vaultPath }, null, 2) }],
            isError: true,
        };
    }

    const stats = await getPathStats(vaultPath);

    if (!stats.isDirectory) {
        return {
            content: [{ type: "text" as const, text: JSON.stringify({ status: "error", message: "Vault path is not a directory", path: vaultPath }, null, 2) }],
            isError: true,
        };
    }

    return {
        content: [{
            type: "text" as const,
            text: JSON.stringify({
                status: "ok",
                path: vaultPath,
                accessible: true,
                isDirectory: true,
            }, null, 2),
        }],
    };
}
