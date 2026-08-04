import { rename, mkdir, stat } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { getVaultRoot, pathExists } from "./vault.js";

const TRASH_DIR = ".trash";

/**
 * Get the absolute path to the trash directory.
 */
export function getTrashPath(): string {
    return join(getVaultRoot(), TRASH_DIR);
}

/**
 * Move a file or folder to the trash, preserving its relative path structure.
 * Returns the trash destination path.
 */
export async function moveToTrash(fullPath: string): Promise<string> {
    const vaultRoot = getVaultRoot();
    const relPath = relative(vaultRoot, fullPath);
    const trashDest = join(getTrashPath(), relPath);

    // Ensure the destination directory exists in trash
    await mkdir(dirname(trashDest), { recursive: true });

    // Handle name collision in trash by appending timestamp
    let finalDest = trashDest;
    if (await pathExists(finalDest)) {
        const ext = finalDest.match(/\.\w+$/)?.[0] ?? "";
        const base = ext ? finalDest.slice(0, -ext.length) : finalDest;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        finalDest = `${base}__${timestamp}${ext}`;
    }

    await rename(fullPath, finalDest);
    return finalDest;
}

/**
 * Restore a file or folder from the trash back to its original location.
 * Returns the restored path.
 */
export async function restoreFromTrash(trashPath: string): Promise<string> {
    const vaultRoot = getVaultRoot();
    const trashRoot = getTrashPath();

    // Calculate the original relative path from the trash path
    const relPath = relative(trashRoot, trashPath);
    const originalDest = join(vaultRoot, relPath);

    // Ensure the destination directory exists
    await mkdir(dirname(originalDest), { recursive: true });

    // Handle name collision at restore destination
    let finalDest = originalDest;
    if (await pathExists(finalDest)) {
        const ext = finalDest.match(/\.\w+$/)?.[0] ?? "";
        const base = ext ? finalDest.slice(0, -ext.length) : finalDest;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        finalDest = `${base}__restored_${timestamp}${ext}`;
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
            if (entry.isDirectory()) {
                await scanDir(fullPath);
            } else {
                const s = await stat(fullPath);
                const relPath = relative(trashRoot, fullPath).replace(/\\/g, "/");
                items.push({
                    path: relPath,
                    isFile: entry.isFile(),
                    deletedAt: s.mtime.toISOString(),
                });
            }
        }
    }

    await scanDir(trashRoot);
    return items;
}
