import { resolve, relative, isAbsolute, join, dirname } from "node:path";
import { access, stat } from "node:fs/promises";
import { constants, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

let vaultRoot: string;

/**
 * Resolve the vault path from available configuration sources.
 *
 * Priority order:
 * 1. CLI argument (`node dist/index.js /path/to/vault`)
 * 2. Environment variable `NOTES_VAULT_PATH`
 * 3. `vault.config.json` in the project root (`{ "vaultPath": "..." }`)
 * 4. `.env` file in the project root (`NOTES_VAULT_PATH=...`)
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

    // 3. vault.config.json in the project root
    const configPath = resolve(getProjectRoot(), "vault.config.json");
    try {
        const configContent = readFileSync(configPath, "utf-8");
        const config = JSON.parse(configContent);
        if (config.vaultPath && config.vaultPath.trim() !== "") {
            return resolve(config.vaultPath);
        }
        // vaultPath is empty — try auto-detection
        const autoDetected = autoDetectVault();
        if (autoDetected) {
            console.log(`Auto-detected vault at: ${autoDetected}`);
            console.log(`Tip: Edit vault.config.json to set your vault path explicitly.`);
            return autoDetected;
        }
    } catch {
        // Config file doesn't exist or is invalid — continue to next method
    }

    // 4. .env file in the project root
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
        "  3. Config file:    edit vault.config.json → { \"vaultPath\": \"/path/to/vault\" }\n" +
        "  4. .env file:      add NOTES_VAULT_PATH=/path/to/vault to a .env file\n\n" +
        "Quick start: Edit vault.config.json and set your vault path.\n",
    );
    process.exit(1);
}

/**
 * Auto-detect common vault locations (Obsidian, etc.)
 */
function autoDetectVault(): string | null {
    const home = homedir();

    // Common vault locations to check
    const candidates = [
        // Windows
        join(home, "Documents", "vault"),
        join(home, "Documents", "Obsidian", "vault"),
        join(home, "Obsidian", "vault"),
        join("D:/", "vault"),
        join("C:/", "vault"),
        // macOS
        join(home, "Documents", "vault"),
        join(home, "Library", "Mobile Documents", "iCloud~md~obsidian", "Documents"),
        // Linux
        join(home, "Documents", "vault"),
        join(home, "obsidian-vault"),
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

/**
 * Get the project root directory (where vault.config.json lives).
 */
function getProjectRoot(): string {
    // In compiled output: dist/utils/vault.js → go up 2 levels
    // In source: src/utils/vault.ts → go up 2 levels
    const currentDir = dirname(fileURLToPath(import.meta.url));
    return resolve(currentDir, "..", "..");
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
