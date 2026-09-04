import { resolve, relative, isAbsolute, join, dirname, normalize } from "node:path";
import { access, stat, realpath, lstat, readdir, readFile } from "node:fs/promises";
import { constants, readFileSync, existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";

/** Directories that must never be deleted/modified by any tool. */
const PROTECTED_DIRS = new Set([".trash", ".git", ".quill-sessions", "node_modules"]);

/** Whether the current platform is case-insensitive (Windows, macOS). */
const IS_CASE_INSENSITIVE = platform() === "win32" || platform() === "darwin";

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
        if (config.vaultPath && config.vaultPath.trim() !== "" && !config.vaultPath.includes("enter the path")) {
            return resolve(config.vaultPath);
        }
        // vaultPath is empty — try auto-detection
        const autoDetected = autoDetectVault();
        if (autoDetected) {
            logger.info(`Auto-detected vault at: ${autoDetected}`);
            logger.info(`Tip: Edit vault.config.json to set your vault path explicitly.`);
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

    logger.error(
        "No vault path configured. " + "Set via CLI arg, NOTES_VAULT_PATH env, vault.config.json, or .env file.",
    );
    // The original multi-line message is preserved as a single structured log:
    logger.error(
        "Configuration methods: " +
            "(1) CLI: node dist/index.js /path/to/vault " +
            "(2) Env: NOTES_VAULT_PATH=/path/to/vault " +
            '(3) Config: vault.config.json → { "vaultPath": "/path/to/vault" } ' +
            "(4) .env: NOTES_VAULT_PATH=/path/to/vault",
    );
    // Keep the original console.error for startup failure visibility:
    console.error(
        "Error: No vault path configured.\n\n" +
            "Set your vault path using one of these methods:\n" +
            "  1. CLI argument:   node dist/index.js /path/to/vault\n" +
            "  2. Environment:    set NOTES_VAULT_PATH=/path/to/vault\n" +
            '  3. Config file:    edit vault.config.json → { "vaultPath": "/path/to/vault" }\n' +
            "  4. .env file:      add NOTES_VAULT_PATH=/path/to/vault to a .env file\n\n" +
            "Quick start: Edit vault.config.json and set your vault path.\n",
    );
    process.exit(1);
}

/**
 * Auto-detect common vault locations.
 */
function autoDetectVault(): string | null {
    const home = homedir();

    // Common vault locations to check
    const candidates = [
        // Windows
        join(home, "Documents", "vault"),
        join(home, "Documents", "notes"),
        join(home, "Documents", "markdown"),
        join("D:/", "vault"),
        join("C:/", "vault"),
        // macOS
        join(home, "Documents", "vault"),
        join(home, "Documents", "notes"),
        // Linux
        join(home, "Documents", "vault"),
        join(home, "vault"),
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
 * Verify that an existing path resolves to within the vault after resolving
 * symlinks/junctions. Throws if the canonical path escapes the vault.
 * Use this for read/delete operations on paths that must exist.
 */
export async function assertWithinVault(absolutePath: string): Promise<void> {
    const vaultReal = await realpath(vaultRoot);
    const targetReal = await realpath(absolutePath);
    const rel = relative(vaultReal, targetReal);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`Path traversal blocked: "${absolutePath}" resolves (via symlink) outside the vault.`);
    }
}

/**
 * For write/move destinations that may not exist yet, walk up to the deepest
 * existing ancestor and verify its canonical path is within the vault.
 */
export async function assertParentWithinVault(absolutePath: string): Promise<void> {
    const vaultReal = await realpath(vaultRoot);
    let current = dirname(absolutePath);
    while (current !== dirname(current)) {
        if (existsSync(current)) {
            const real = await realpath(current);
            const rel = relative(vaultReal, real);
            if (rel.startsWith("..") || isAbsolute(rel)) {
                throw new Error(`Path traversal blocked: parent of "${absolutePath}" resolves outside the vault.`);
            }
            return;
        }
        current = dirname(current);
    }
}

/**
 * Block operations that target the vault root itself.
 * Uses resolved/canonical path comparison to catch ALL representations:
 * `.`, empty, `folder/..`, absolute vault path, case variants on Windows.
 */
export function assertNotVaultRoot(relativePath: string): void {
    // Fast-path: reject obvious root aliases
    const normalized = normalize(relativePath).replace(/\\/g, "/");
    if (normalized === "." || normalized === "" || normalized === "/") {
        throw new Error("Cannot modify the vault root itself.");
    }

    // Resolve the path against vault root and compare
    const resolved = isAbsolute(relativePath) ? resolve(relativePath) : resolve(vaultRoot, relativePath);
    const vaultResolved = resolve(vaultRoot);

    // Direct comparison (handles absolute paths pointing to vault root)
    if (resolved === vaultResolved) {
        throw new Error("Cannot modify the vault root itself.");
    }

    // Case-insensitive comparison on Windows/macOS
    if (IS_CASE_INSENSITIVE && resolved.toLowerCase() === vaultResolved.toLowerCase()) {
        throw new Error("Cannot modify the vault root itself.");
    }
}

/**
 * Block operations on protected internal directories (.trash, .git, etc).
 * Segment-aware: matches whole path components only (`.github` is allowed, `.git` is not).
 * Case-insensitive on Windows/macOS.
 */
export function assertNotProtectedDir(relativePath: string): void {
    const normalized = normalize(relativePath).replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    for (const part of parts) {
        const segment = IS_CASE_INSENSITIVE ? part.toLowerCase() : part;
        for (const protectedDir of PROTECTED_DIRS) {
            const target = IS_CASE_INSENSITIVE ? protectedDir.toLowerCase() : protectedDir;
            if (segment === target) {
                throw new Error(`Operation blocked: "${part}" is a protected internal directory.`);
            }
        }
    }
}

/**
 * Centralized safety check for write/move/copy destinations.
 * Combines vault-root check, protected-dir check, and symlink defense.
 * For existing paths: verifies canonical path via realpath.
 * For new paths: verifies deepest existing ancestor.
 */
export async function safeWriteTarget(relativePath: string): Promise<string> {
    assertNotVaultRoot(relativePath);
    assertNotProtectedDir(relativePath);
    const fullPath = resolveVaultPath(relativePath);
    const exists = await pathExists(fullPath);
    if (exists) {
        await assertWithinVault(fullPath);
    } else {
        await assertParentWithinVault(fullPath);
    }
    return fullPath;
}

/**
 * Centralized safety check for delete operations.
 * Combines vault-root check, protected-dir check, and symlink defense.
 */
export async function safeDeleteTarget(relativePath: string): Promise<string> {
    assertNotVaultRoot(relativePath);
    assertNotProtectedDir(relativePath);
    const fullPath = resolveVaultPath(relativePath);
    if (await pathExists(fullPath)) {
        await assertWithinVault(fullPath);
    }
    return fullPath;
}

/**
 * Centralized safety check for read operations.
 * Ensures the path resolves within the vault and verifies canonical containment
 * via realpath to prevent symlink/junction escapes.
 */
export async function safeReadTarget(relativePath: string): Promise<string> {
    const fullPath = resolveVaultPath(relativePath);
    if (!(await pathExists(fullPath))) {
        throw new Error(`Path not found: "${relativePath}".`);
    }
    await assertWithinVault(fullPath);
    return fullPath;
}

/**
 * Resolve a configured internal directory path against the vault root.
 * Validates that the resolved path is canonically within the vault.
 * Use this for internal utility writers (checkpoint, audit, session, etc.)
 * that legitimately write to internal directories.
 * Does NOT check protected-dir restrictions (those are for user-facing tools).
 */
export async function safeInternalPath(relativeDir: string): Promise<string> {
    const vaultRoot = getVaultRoot();
    const fullPath = resolve(vaultRoot, relativeDir);
    const rel = relative(vaultRoot, fullPath);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`Configuration error: internal path "${relativeDir}" resolves outside the vault.`);
    }
    // Canonical check if path exists
    if (existsSync(fullPath)) {
        const vaultReal = await realpath(vaultRoot);
        const targetReal = await realpath(fullPath);
        const realRel = relative(vaultReal, targetReal);
        if (realRel.startsWith("..") || isAbsolute(realRel)) {
            throw new Error(
                `Configuration error: internal path "${relativeDir}" resolves (via symlink) outside the vault.`,
            );
        }
    }
    return fullPath;
}

/**
 * Verify that an absolute path is canonically within a given root.
 * Generic version of assertWithinVault that works for any root (vault, .trash, etc).
 */
export async function assertWithinRoot(absolutePath: string, root: string): Promise<void> {
    const rootReal = await realpath(root);
    const targetReal = await realpath(absolutePath);
    const rel = relative(rootReal, targetReal);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`Path traversal blocked: "${absolutePath}" resolves outside allowed root.`);
    }
}

/**
 * Check if a path is a symbolic link (does not follow the link).
 */
export async function isSymlink(absolutePath: string): Promise<boolean> {
    try {
        const s = await lstat(absolutePath);
        return s.isSymbolicLink();
    } catch {
        return false;
    }
}

/** Structured diagnostic for entries skipped during safeWalkDir traversal. */
export interface WalkSkipEntry {
    path: string;
    reason: "symlink" | "containment_violation" | "inaccessible" | "disappeared";
}

/**
 * Safely walk a directory tree, never recursing into symlinks or junctions.
 * Uses lstat() to detect links before traversal.
 * Calls the callback for each entry with its absolute path and Dirent.
 * Optionally collects structured diagnostics for skipped entries.
 * @param dir - Directory to walk
 * @param allowedRoot - Canonical root that all entries must remain within
 * @param callback - Called for each file/directory entry
 * @param skipLog - Optional array that receives structured skip diagnostics
 */
export async function safeWalkDir(
    dir: string,
    allowedRoot: string,
    callback: (
        entryPath: string,
        entry: { name: string; isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean },
    ) => Promise<void>,
    skipLog?: WalkSkipEntry[],
): Promise<void> {
    const allowedReal = await realpath(allowedRoot);

    async function walk(currentDir: string): Promise<void> {
        // Verify current directory is still within allowed root
        let currentReal: string;
        try {
            currentReal = await realpath(currentDir);
        } catch {
            skipLog?.push({ path: currentDir, reason: "disappeared" });
            return;
        }
        const rel = relative(allowedReal, currentReal);
        if (rel.startsWith("..") || isAbsolute(rel)) {
            skipLog?.push({ path: currentDir, reason: "containment_violation" });
            return;
        }

        let entries;
        try {
            entries = await readdir(currentDir, { withFileTypes: true });
        } catch {
            skipLog?.push({ path: currentDir, reason: "inaccessible" });
            return;
        }

        for (const entry of entries) {
            const entryPath = join(currentDir, entry.name);

            // Check if entry is a symlink using lstat - never follow symlinks during traversal
            let entryStat;
            try {
                entryStat = await lstat(entryPath);
            } catch {
                skipLog?.push({ path: entryPath, reason: "disappeared" });
                continue;
            }
            if (entryStat.isSymbolicLink()) {
                skipLog?.push({ path: entryPath, reason: "symlink" });
                continue;
            }

            await callback(entryPath, entry);

            if (entry.isDirectory()) {
                await walk(entryPath);
            }
        }
    }

    await walk(dir);
}

/**
 * Safely read a file with canonical containment verification.
 * Ensures the file exists and is within the allowed root before reading.
 */
export async function safeReadFile(absolutePath: string, allowedRoot: string): Promise<string> {
    await assertWithinRoot(absolutePath, allowedRoot);
    return readFile(absolutePath, "utf-8");
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
