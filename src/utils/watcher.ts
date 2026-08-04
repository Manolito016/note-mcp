import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { getVaultRoot } from "./vault.js";
import { logger } from "./logger.js";

interface FileSnapshot {
    mtime: number;
    size: number;
}

export interface FileChange {
    path: string;
    type: "created" | "modified" | "deleted";
    timestamp: string;
}

class VaultWatcher {
    private snapshots: Map<string, FileSnapshot> = new Map();
    private pendingChanges: FileChange[] = [];
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private pollingInterval: number;
    private running = false;

    constructor() {
        const envInterval = parseInt(process.env.NOTES_WATCH_INTERVAL || "5000", 10);
        this.pollingInterval = envInterval > 0 ? envInterval : 5000;
    }

    /**
     * Take initial snapshot of all files in the vault.
     */
    async initialize(): Promise<void> {
        const vaultRoot = getVaultRoot();
        await this.scanDirectory(vaultRoot);
        logger.info("File watcher initialized", { trackedFiles: this.snapshots.size });
    }

    /**
     * Start periodic polling for changes.
     */
    start(): void {
        if (this.running || this.pollingInterval <= 0) return;
        this.running = true;

        this.intervalId = setInterval(async () => {
            try {
                await this.detectChanges();
            } catch (err) {
                logger.error("File watcher poll error", {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }, this.pollingInterval);

        logger.info("File watcher started", { intervalMs: this.pollingInterval });
    }

    /**
     * Stop polling.
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.running = false;
        logger.info("File watcher stopped");
    }

    /**
     * Get and clear pending changes.
     */
    getChanges(): FileChange[] {
        const changes = [...this.pendingChanges];
        this.pendingChanges = [];
        return changes;
    }

    /**
     * Get count of pending changes without clearing.
     */
    getPendingCount(): number {
        return this.pendingChanges.length;
    }

    /**
     * Get pending changes without clearing them.
     */
    peekChanges(): FileChange[] {
        return [...this.pendingChanges];
    }

    /**
     * Scan a directory recursively and record file snapshots.
     */
    private async scanDirectory(dir: string): Promise<void> {
        try {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === ".trash" || entry.name === "node_modules" || entry.name === ".git") continue;

                const fullPath = join(dir, entry.name);
                if (entry.isDirectory()) {
                    await this.scanDirectory(fullPath);
                } else if (entry.isFile() && entry.name.endsWith(".md")) {
                    try {
                        const s = await stat(fullPath);
                        const relPath = relative(getVaultRoot(), fullPath).replace(/\\/g, "/");
                        this.snapshots.set(relPath, { mtime: s.mtimeMs, size: s.size });
                    } catch {
                        // Skip inaccessible files
                    }
                }
            }
        } catch {
            // Skip inaccessible directories
        }
    }

    /**
     * Detect changes by comparing current state with snapshots.
     */
    private async detectChanges(): Promise<void> {
        const vaultRoot = getVaultRoot();
        const currentFiles = new Map<string, FileSnapshot>();

        // Scan current state
        await this.scanCurrentState(vaultRoot, currentFiles);

        const now = new Date().toISOString();

        // Check for new and modified files
        for (const [path, snapshot] of currentFiles) {
            const prev = this.snapshots.get(path);
            if (!prev) {
                this.pendingChanges.push({ path, type: "created", timestamp: now });
            } else if (prev.mtime !== snapshot.mtime || prev.size !== snapshot.size) {
                this.pendingChanges.push({ path, type: "modified", timestamp: now });
            }
        }

        // Check for deleted files
        for (const [path] of this.snapshots) {
            if (!currentFiles.has(path)) {
                this.pendingChanges.push({ path, type: "deleted", timestamp: now });
            }
        }

        // Update snapshots
        this.snapshots = currentFiles;
    }

    /**
     * Scan current file state into the provided map.
     */
    private async scanCurrentState(dir: string, result: Map<string, FileSnapshot>): Promise<void> {
        try {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === ".trash" || entry.name === "node_modules" || entry.name === ".git") continue;

                const fullPath = join(dir, entry.name);
                if (entry.isDirectory()) {
                    await this.scanCurrentState(fullPath, result);
                } else if (entry.isFile() && entry.name.endsWith(".md")) {
                    try {
                        const s = await stat(fullPath);
                        const relPath = relative(getVaultRoot(), fullPath).replace(/\\/g, "/");
                        result.set(relPath, { mtime: s.mtimeMs, size: s.size });
                    } catch {
                        // Skip inaccessible files
                    }
                }
            }
        } catch {
            // Skip inaccessible directories
        }
    }
}

// Singleton instance
export const vaultWatcher = new VaultWatcher();
