import { resolve, relative, isAbsolute, join } from "node:path";
import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { config as loadDotenv } from "dotenv";

let vaultRoot: string;

/**
 * Resolve the vault path from available configuration sources.
 *
 * Priority order:
 * 1. CLI argument (`node dist/index.js /path/to/vault`)
 * 2. Environment variable `NOTES_VAULT_PATH`
 * 3. `.env` file in the project root (`NOTES_VAULT_PATH=...`)
 */
function resolveVaultRoot(): string {
    // 1. CLI argument
    const cliArg = process.argv[2];
    if (cliArg) {
        return resolve(cliArg);
    }

    // 2. Environment variable (already set in the system)
    const envVar = process.env.NOTES_VAULT_PATH;
    if (envVar) {
        return resolve(envVar);
    }

    // 3. .env file in the project root
    loadDotenv();
    const dotenvPath = process.env.NOTES_VAULT_PATH;
    if (dotenvPath) {
        return resolve(dotenvPath);
    }

    console.error(
        "Error: No vault path configured.\n\n" +
        "Set your vault path using one of these methods:\n" +
        "  1. CLI argument:   node dist/index.js /path/to/vault\n" +
        "  2. Environment:    set NOTES_VAULT_PATH=/path/to/vault\n" +
        "  3. .env file:      add NOTES_VAULT_PATH=/path/to/vault to a .env file\n",
    );
    process.exit(1);
}

/**
 * Initialize the vault root from available configuration sources.
 */
export function initVault(): string {
    vaultRoot = resolveVaultRoot();
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
