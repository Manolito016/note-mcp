/**
 * In-memory search index with BM25 ranking.
 *
 * Pre-tokenises vault content for instant lookups instead of
 * reading every file from disk on every search call.
 * Supports incremental invalidation via a dirty flag.
 */

import { readdir, readFile, stat, lstat } from "node:fs/promises";
import { relative } from "node:path";
import { getVaultRoot } from "./vault.js";
import { parseFrontmatter } from "./frontmatter.js";
import { levenshteinDistance, autoTolerance } from "./fuzzy-search.js";

// ─── Types ───────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([".trash", ".quill-sessions", ".git", "node_modules"]);
const TOKEN_RE = /[\p{L}\p{N}]+/gu;

export interface IndexedDocument {
    /** Vault-relative path with forward slashes */
    path: string;
    /** File name including extension */
    filename: string;
    /** File size in bytes */
    size: number;
    /** ISO modified timestamp */
    modified: string;
    /** Raw content (full file) */
    rawContent: string;
    /** Content split into lines (trimmed) */
    lines: string[];
    /** Parsed frontmatter record */
    frontmatter: Record<string, unknown>;
    /** Normalised tags from frontmatter */
    tags: string[];
    /** Normalised title from frontmatter */
    title?: string;
    /** Number of whitespace-delimited tokens in the body */
    tokenCount: number;
    /** Token → term-frequency map for BM25 */
    termFreq: Map<string, number>;
}

export interface BM25Params {
    k1: number;
    b: number;
}

const DEFAULT_BM25: BM25Params = { k1: 1.2, b: 0.75 };

// ─── Search Index ────────────────────────────────────────────────────

class SearchIndex {
    private documents = new Map<string, IndexedDocument>();
    /** Inverted index: token → set of doc paths */
    private inverted = new Map<string, Set<string>>();
    private dirty = true;
    private totalDocs = 0;
    private avgDocLength = 0;
    /** All unique indexed terms (for "did you mean") */
    private allTerms: string[] = [];

    // ── Public API ───────────────────────────────────────────────────

    markDirty(): void {
        this.dirty = true;
    }

    async ensureSynchronized(): Promise<void> {
        if (!this.dirty && this.documents.size > 0) return;
        await this.build();
    }

    getDocuments(): IndexedDocument[] {
        return [...this.documents.values()];
    }

    getDocument(path: string): IndexedDocument | undefined {
        return this.documents.get(path);
    }

    /**
     * Return all unique indexed terms (useful for "did you mean" suggestions).
     */
    getAllTerms(): string[] {
        return this.allTerms;
    }

    /**
     * Compute BM25 score for a set of query tokens against a document.
     */
    bm25Score(doc: IndexedDocument, queryTokens: string[], params: BM25Params = DEFAULT_BM25): number {
        let score = 0;
        const docLen = doc.tokenCount || 1;
        for (const token of queryTokens) {
            const tf = doc.termFreq.get(token) ?? 0;
            if (tf === 0) continue;
            const df = this.inverted.get(token)?.size ?? 0;
            const idf = Math.log(1 + (this.totalDocs - df + 0.5) / (df + 0.5));
            const tfNorm =
                (tf * (params.k1 + 1)) / (tf + params.k1 * (1 - params.b + params.b * (docLen / this.avgDocLength)));
            score += idf * tfNorm;
        }
        return score;
    }

    /**
     * Find the closest indexed term to `word` using Levenshtein distance.
     * Returns undefined if no close match exists.
     */
    suggestCorrection(word: string): string | undefined {
        const normalized = word.toLowerCase();
        const tol = Math.max(1, autoTolerance(normalized.length));
        let best: string | undefined;
        let bestDist = tol + 1;

        for (const term of this.allTerms) {
            if (Math.abs(term.length - normalized.length) > tol) continue;
            const dist = levenshteinDistance(normalized, term);
            if (dist < bestDist) {
                bestDist = dist;
                best = term;
            }
        }
        return best && bestDist <= tol ? best : undefined;
    }

    // ── Index Building ───────────────────────────────────────────────

    private async build(): Promise<void> {
        const root = getVaultRoot();
        this.documents.clear();
        this.inverted.clear();

        await this.indexDir(root, root);

        // Compute BM25 globals
        this.totalDocs = this.documents.size;
        let totalTokens = 0;
        for (const doc of this.documents.values()) totalTokens += doc.tokenCount;
        this.avgDocLength = this.totalDocs > 0 ? totalTokens / this.totalDocs : 1;

        // Collect unique terms for suggestions
        this.allTerms = [...this.inverted.keys()].sort();

        this.dirty = false;
    }

    private async indexDir(root: string, dir: string): Promise<void> {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) continue;
            const fullPath = `${dir}/${entry.name}`;
            // Symlink defense: never recurse into symbolic links
            try {
                const entryStat = await lstat(fullPath);
                if (entryStat.isSymbolicLink()) continue;
            } catch {
                continue;
            }
            if (entry.isDirectory()) {
                await this.indexDir(root, fullPath);
            } else if (entry.isFile() && entry.name.endsWith(".md")) {
                try {
                    await this.indexFile(root, fullPath);
                } catch {
                    // Skip unreadable
                }
            }
        }
    }

    private async indexFile(root: string, fullPath: string): Promise<void> {
        const raw = await readFile(fullPath, "utf-8");
        const relPath = relative(root, fullPath).replace(/\\/g, "/");
        const { frontmatter } = parseFrontmatter(raw);

        const lines = raw.split("\n").map((l) => l.trim());
        const tokens = raw.toLowerCase().match(TOKEN_RE) ?? [];
        const tokenCount = tokens.length;

        // Build term-frequency map
        const termFreq = new Map<string, number>();
        for (const t of tokens) {
            termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
        }

        // Normalise tags
        const rawTags = frontmatter.tags;
        const tags = normaliseList(rawTags);
        const title = typeof frontmatter.title === "string" ? frontmatter.title : undefined;

        let fileSize = 0;
        let modified = "";
        try {
            const s = await stat(fullPath);
            fileSize = s.size;
            modified = s.mtime.toISOString();
        } catch {
            // Ignore
        }

        const doc: IndexedDocument = {
            path: relPath,
            filename: relPath.split("/").pop() ?? relPath,
            size: fileSize,
            modified,
            rawContent: raw,
            lines,
            frontmatter,
            tags,
            title,
            tokenCount,
            termFreq,
        };

        this.documents.set(relPath, doc);

        // Update inverted index
        for (const token of termFreq.keys()) {
            let set = this.inverted.get(token);
            if (!set) {
                set = new Set();
                this.inverted.set(token, set);
            }
            set.add(relPath);
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function normaliseList(raw: unknown): string[] {
    if (!raw) return [];
    const items = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
    return items
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean);
}

// ─── Singleton ────────────────────────────────────────────────────────

export const searchIndex = new SearchIndex();
