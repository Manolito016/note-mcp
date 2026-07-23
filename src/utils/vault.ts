import { resolve, relative, isAbsolute, join } from "node:path";
import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";

let vaultRoot: string;

/**
 * Initialize the vault root from the CLI argument.
 */
export function initVault(): string {
    const arg = process.argv[2];
    if (!arg) {
        console.error("Usage: notes-mcp <vault-path>");
        process.exit(1);
    }
    vaultRoot = resolve(arg);
    return vaultRoot;
}

/**
 * Get the vault root path.
 */
export function getVaultRoot(): string {
    return vaultRoot;
}

/**
 * Resolve a user-provided relative path against the vault root.
 * Prevents path traversal attacks by ensuring the result is inside the vault.
 */
export function resolveVaultPath(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, "/");
    const target = isAbsolute(normalized) ? resolve(normalized) : resolve(vaultRoot, normalized);
    const rel = relative(vaultRoot, target);

    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`Path traversal blocked: "${relativePath}" resolves outside the vault.`);
    }

    return target;
}

/**
 * Check if a file or directory exists at the given path.
 */
export async function pathExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get stats for a file or directory.
 */
export async function getPathStats(filePath: string): Promise<{
    size: number;
    isFile: boolean;
    isDirectory: boolean;
    created: string;
    modified: string;
}> {
    const s = await stat(filePath);
    return {
        size: s.size,
        isFile: s.isFile(),
        isDirectory: s.isDirectory(),
        created: s.birthtime.toISOString(),
        modified: s.mtime.toISOString(),
    };
}
