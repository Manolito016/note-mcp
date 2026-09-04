import { rename, mkdir, realpath, lstat } from "node:fs/promises";
import { join, dirname, relative, resolve, isAbsolute, normalize } from "node:path";
import {
    getVaultRoot,
    pathExists,
    assertNotVaultRoot,
    assertNotProtectedDir,
    assertWithinVault,
    assertParentWithinVault,
    assertWithinRoot,
    isSymlink,
} from "./vault.js";

const TRASH_DIR = ".trash";

/**
 * Get the absolute path to the trash directory.
 */
export function getTrashPath(): string {
    return join(getVaultRoot(), TRASH_DIR);
}

/**
 * Verify that an absolute path is canonically inside the trash root.
 * Uses realpath to resolve symlinks/junctions.
 */
async function assertWithinTrash(absolutePath: string): Promise<void> {
    await assertWithinRoot(absolutePath, getTrashPath());
}

/**
 * Validate a trash destination path canonically.
 * Checks the nearest existing ancestor and rejects symlinks in the chain.
 */
async function assertTrashDestSafe(absPath: string): Promise<void> {
    const trashReal = await realpath(getTrashPath());

    // Check the path itself if it exists
    if (await pathExists(absPath)) {
        const targetReal = await realpath(absPath);
        const rel = relative(trashReal, targetReal);
        if (rel.startsWith("..") || isAbsolute(rel)) {
            throw new Error(`Path traversal blocked: trash destination resolves outside .trash.`);
        }
        return;
    }

    // For non-existing paths, walk up to the deepest existing ancestor
    let current = dirname(absPath);
    while (current !== dirname(current)) {
        if (await pathExists(current)) {
            const real = await realpath(current);
            const rel = relative(trashReal, real);
            if (rel.startsWith("..") || isAbsolute(rel)) {
                throw new Error(`Path traversal blocked: trash destination parent resolves outside .trash.`);
            }
            return;
        }
        current = dirname(current);
    }
}

/**
 * Move a file or folder to the trash, preserving its relative path structure.
 * Hardened: canonically validates .trash root, destination ancestors,
 * collision-renamed destinations, and rejects symlink/junction escapes.
 * Returns the trash destination path.
 */
export async function moveToTrash(fullPath: string): Promise<string> {
    const vaultRoot = getVaultRoot();
    const trashRoot = getTrashPath();

    // Validate the source is within the vault
    await assertWithinVault(fullPath);

    // Reject if the source itself is a symlink
    if (await isSymlink(fullPath)) {
        throw new Error(`Path traversal blocked: source is a symbolic link.`);
    }

    const relPath = relative(vaultRoot, fullPath);
    const trashDest = join(trashRoot, relPath);

    // Ensure the trash root exists before canonical validation
    await mkdir(trashRoot, { recursive: true });

    // Validate the trash destination's nearest existing ancestor
    await assertTrashDestSafe(trashDest);

    // Ensure the destination directory exists in trash
    await mkdir(dirname(trashDest), { recursive: true });

    // Re-validate destination directory after mkdir
    await assertWithinTrash(dirname(trashDest));

    // Handle name collision in trash by appending timestamp
    let finalDest = trashDest;
    if (await pathExists(finalDest)) {
        // Reject collision if the existing item is a symlink
        if (await isSymlink(finalDest)) {
            throw new Error(`Path traversal blocked: collision target in .trash is a symbolic link.`);
        }
        const ext = finalDest.match(/\.\w+$/)?.[0] ?? "";
        const base = ext ? finalDest.slice(0, -ext.length) : finalDest;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        finalDest = `${base}__${timestamp}${ext}`;
    }

    // Final revalidation of the destination immediately before rename
    await assertTrashDestSafe(finalDest);

    await rename(fullPath, finalDest);
    return finalDest;
}

/**
 * Validate that a user-provided trash path is safely inside .trash.
 * Rejects: `..` traversal, absolute paths, mixed-separator traversal,
 * paths resolving to .trash itself, symlink/junction escapes.
 * Returns the canonical absolute path inside .trash.
 */
export async function safeTrashSource(userPath: string): Promise<string> {
    const trashRoot = getTrashPath();

    // Reject absolute paths
    if (isAbsolute(userPath)) {
        throw new Error(`Path traversal blocked: absolute paths are not allowed in trash operations.`);
    }

    // Lexical traversal check: normalize and reject `..` components
    const normalized = normalize(userPath).replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    if (parts.includes("..")) {
        throw new Error(`Path traversal blocked: "${userPath}" contains traversal components.`);
    }

    // Reject empty or root-equivalent paths
    if (normalized === "." || normalized === "" || parts.length === 0) {
        throw new Error("Cannot operate on the trash root itself.");
    }

    // Resolve against trash root
    const resolved = resolve(trashRoot, userPath);

    // Verify the resolved path is within trash root (lexical)
    const rel = relative(trashRoot, resolved);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`Path traversal blocked: "${userPath}" resolves outside .trash.`);
    }

    // Verify the path exists
    if (!(await pathExists(resolved))) {
        throw new Error(`Item not found in trash at ".trash/${userPath}".`);
    }

    // Canonical symlink defense: verify realpath stays inside trash
    const trashReal = await realpath(trashRoot);
    const targetReal = await realpath(resolved);
    const realRel = relative(trashReal, targetReal);
    if (realRel.startsWith("..") || isAbsolute(realRel)) {
        throw new Error(`Path traversal blocked: ".trash/${userPath}" resolves (via symlink) outside .trash.`);
    }

    return resolved;
}

/**
 * Validate that a restore destination is safely inside the vault.
 * Rejects vault root, protected directories, and symlink escapes.
 * Returns the canonical absolute destination path.
 */
export async function safeRestoreDestination(relPath: string): Promise<string> {
    // Reject vault root targets
    assertNotVaultRoot(relPath);

    // Reject protected directory targets
    assertNotProtectedDir(relPath);

    const vaultRoot = getVaultRoot();
    const destPath = join(vaultRoot, relPath);

    // Verify the destination resolves within the vault
    const vaultReal = await realpath(vaultRoot);
    const destResolved = resolve(destPath);
    const rel = relative(vaultReal, destResolved);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`Path traversal blocked: restore destination "${relPath}" resolves outside the vault.`);
    }

    // If destination exists, verify canonical containment
    if (await pathExists(destPath)) {
        await assertWithinVault(destPath);
    } else {
        // For new destinations, verify deepest existing ancestor
        await assertParentWithinVault(destPath);
    }

    return destPath;
}

/**
 * Restore a file or folder from the trash back to its original location.
 * Hardened against races: re-validates source and destination immediately
 * before rename, validates after mkdir, validates collision-renamed destinations
 * canonically, and ensures collision handling cannot follow symlinks.
 * Returns the restored path.
 */
export async function restoreFromTrash(trashPath: string): Promise<string> {
    const vaultRoot = getVaultRoot();
    const trashRoot = getTrashPath();

    // Calculate the original relative path from the trash path
    const relPath = relative(trashRoot, trashPath);
    const originalDest = join(vaultRoot, relPath);

    // --- Validate source canonically inside trash ---
    const trashReal = await realpath(trashRoot);
    const sourceReal = await realpath(trashPath);
    const sourceRel = relative(trashReal, sourceReal);
    if (sourceRel.startsWith("..") || isAbsolute(sourceRel)) {
        throw new Error(`Path traversal blocked: trash source resolves outside .trash.`);
    }

    // --- Validate destination is within vault ---
    const vaultReal = await realpath(vaultRoot);
    const destResolved = resolve(originalDest);
    const destRel = relative(vaultReal, destResolved);
    if (destRel.startsWith("..") || isAbsolute(destRel)) {
        throw new Error(`Path traversal blocked: restore destination resolves outside the vault.`);
    }

    // Ensure the destination directory exists
    await mkdir(dirname(originalDest), { recursive: true });

    // Re-validate destination directory after mkdir (race protection)
    const destDirReal = await realpath(dirname(originalDest));
    const destDirRel = relative(vaultReal, destDirReal);
    if (destDirRel.startsWith("..") || isAbsolute(destDirRel)) {
        throw new Error(`Path traversal blocked: restore destination directory resolves outside the vault.`);
    }

    // Handle name collision at restore destination
    let finalDest = originalDest;
    if (await pathExists(finalDest)) {
        // Reject collision if the existing item is a symlink (could redirect outside vault)
        if (await isSymlink(finalDest)) {
            throw new Error(`Path traversal blocked: collision target is a symbolic link.`);
        }
        const ext = finalDest.match(/\.\w+$/)?.[0] ?? "";
        const base = ext ? finalDest.slice(0, -ext.length) : finalDest;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        finalDest = `${base}__restored_${timestamp}${ext}`;
    }

    // --- Canonical revalidation of final destination immediately before rename ---
    if (await pathExists(finalDest)) {
        const finalReal = await realpath(finalDest);
        const finalRel = relative(vaultReal, finalReal);
        if (finalRel.startsWith("..") || isAbsolute(finalRel)) {
            throw new Error(`Path traversal blocked: collision-renamed destination resolves outside the vault.`);
        }
    } else {
        // For non-existing final dest, re-validate parent
        const parentReal = await realpath(dirname(finalDest));
        const parentRel = relative(vaultReal, parentReal);
        if (parentRel.startsWith("..") || isAbsolute(parentRel)) {
            throw new Error(`Path traversal blocked: collision-renamed parent resolves outside the vault.`);
        }
    }

    // --- Final source revalidation immediately before rename ---
    const sourceRealFinal = await realpath(trashPath);
    const sourceRelFinal = relative(trashReal, sourceRealFinal);
    if (sourceRelFinal.startsWith("..") || isAbsolute(sourceRelFinal)) {
        throw new Error(`Path traversal blocked: trash source changed during restore.`);
    }

    await rename(trashPath, finalDest);
    return finalDest;
}

/**
 * Check if a path is inside the trash directory.
 */
export function isInTrash(fullPath: string): boolean {
    const trashRoot = getTrashPath();
    const rel = relative(trashRoot, fullPath);
    return !rel.startsWith("..") && !rel.startsWith(".");
}

/**
 * List all items currently in the trash.
 * Uses lstat to skip symlinks during traversal.
 */
export async function listTrash(): Promise<{ path: string; isFile: boolean; deletedAt: string }[]> {
    const trashRoot = getTrashPath();

    if (!(await pathExists(trashRoot))) {
        return [];
    }

    const items: { path: string; isFile: boolean; deletedAt: string }[] = [];

    async function scanDir(dir: string) {
        const { readdir } = await import("node:fs/promises");
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = `${dir}/${entry.name}`;

            // Use lstat to detect symlinks - skip them entirely
            const entryStat = await lstat(fullPath);
            if (entryStat.isSymbolicLink()) {
                continue; // Skip symlinks in trash listing
            }

            if (entry.isDirectory() && entryStat.isDirectory()) {
                await scanDir(fullPath);
            } else if (entryStat.isFile()) {
                const relPath = relative(trashRoot, fullPath).replace(/\\/g, "/");
                items.push({
                    path: relPath,
                    isFile: true,
                    deletedAt: entryStat.mtime.toISOString(),
                });
            }
        }
    }

    await scanDir(trashRoot);
    return items;
}
