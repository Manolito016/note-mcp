/**
 * Smart retrieval engine with BM25 scoring, metadata boosting, and composite ranking.
 * Supports project filtering, context budget modes (compact/standard/deep), and graph proximity.
 */

import { metadataIndex } from "./metadata-index.js";
import type { InvertedIndex, MemoryFilter } from "./metadata-index.js";
import { getConfig } from "./config.js";
import type { MemoryMetadata, MemoryType, Importance } from "./memory-schema.js";

export interface RetrievalQuery {
    query?: string;
    project?: string;
    mode: "compact" | "standard" | "deep";
    type?: MemoryType | MemoryType[];
    tags?: string[];
    limit?: number;
    excludeArchived?: boolean;
    contextMemoryIds?: string[];
}

export interface ScoreBreakdown {
    bm25: number;
    projectBoost: number;
    importanceWeight: number;
    recencyDecay: number;
    confidenceFactor: number;
    graphBoost: number;
    archivedPenalty: number;
    conflictPenalty: number;
    final: number;
}

export interface RetrievalResult {
    memory: MemoryMetadata;
    scores: ScoreBreakdown;
    contentPreview: string;
}

// Mode → result count mapping
const MODE_LIMITS: Record<string, number> = {
    compact: 5,
    standard: 20,
    deep: 100,
};

/**
 * Retrieve memories ranked by composite score.
 */
export async function retrieve(query: RetrievalQuery): Promise<RetrievalResult[]> {
    const config = getConfig();

    // Ensure index is initialized
    if (!metadataIndex.isInitialized()) {
        await metadataIndex.initialize();
    }

    // Build filter
    const filter: MemoryFilter = {};
    if (query.project) filter.project = query.project;
    if (query.type) filter.type = query.type;
    if (query.tags) filter.tags = query.tags;
    if (query.excludeArchived !== false) {
        // Default: exclude archived unless deep mode
        if (query.mode !== "deep") {
            filter.status = ["ACTIVE", "CONFIRMED", "CONFLICTED"];
        }
    }
    if (query.contextMemoryIds) {
        filter.excludeIds = query.contextMemoryIds;
    }

    // Get candidate memories
    const candidates = metadataIndex.query(filter);

    // Tokenize query for BM25
    const queryTokens = query.query ? tokenize(query.query) : [];

    // Score each memory
    const scored: RetrievalResult[] = candidates.map((memory) => {
        const scores = computeScores(memory, queryTokens, query, config);
        return { memory, scores, contentPreview: memory.contentPreview };
    });

    // Sort by final score descending
    scored.sort((a, b) => b.scores.final - a.scores.final);

    // Apply limit
    const limit = query.limit ?? MODE_LIMITS[query.mode] ?? 20;
    return scored.slice(0, limit);
}

/**
 * Quick recall of the most important project memories.
 */
export async function recall(project: string, limit = 10): Promise<RetrievalResult[]> {
    return retrieve({
        project,
        mode: "standard",
        excludeArchived: true,
        limit,
    });
}

/**
 * Compute BM25 score for a document against query tokens.
 */
export function computeBm25Score(
    docId: string,
    queryTokens: string[],
    index: InvertedIndex,
    k1: number,
    b: number,
): number {
    if (queryTokens.length === 0) return 0;

    const N = index.docCount;
    const avgDl = index.avgDocLength;
    const dl = index.docLengths.get(docId) ?? 0;

    let score = 0;
    for (const token of queryTokens) {
        const posting = index.postings.get(token);
        if (!posting) continue;

        const df = posting.size; // Document frequency
        const tf = posting.get(docId)?.tf ?? 0;
        if (tf === 0) continue;

        // IDF with saturation
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

        // TF with length normalization
        const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgDl)));

        score += idf * tfNorm;
    }

    return score;
}

// === INTERNAL ===

function computeScores(
    memory: MemoryMetadata,
    queryTokens: string[],
    query: RetrievalQuery,
    config: ReturnType<typeof getConfig>,
): ScoreBreakdown {
    const ranking = config.ranking;

    // BM25 keyword relevance
    const bm25 = computeBm25Score(
        memory.id,
        queryTokens,
        metadataIndex.getInvertedIndex(),
        ranking.bm25.k1,
        ranking.bm25.b,
    );

    // Project match boost
    let projectBoost = ranking.projectMissPenalty;
    if (query.project && memory.project.toLowerCase() === query.project.toLowerCase()) {
        projectBoost = ranking.projectBoost;
    } else if (!query.project) {
        projectBoost = 1.0; // No project filter = neutral
    }

    // Importance weight
    const importanceWeight = ranking.importanceWeights[memory.importance as Importance] ?? 1.0;

    // Recency decay: exp(-λ × days_since_update)
    const daysSinceUpdate = getDaysSince(memory.updated);
    const recencyDecay = Math.exp(-ranking.recencyLambda * daysSinceUpdate);

    // Confidence factor
    const confidenceFactor = Math.max(memory.confidence, 0.1);

    // Graph proximity boost
    let graphBoost = 1.0;
    if (query.contextMemoryIds && query.contextMemoryIds.length > 0) {
        const sharedLinks = countSharedLinks(memory, query.contextMemoryIds);
        graphBoost = 1.0 + ranking.graphBoostFactor * sharedLinks;
    }

    // Penalties
    const archivedPenalty = memory.status === "ARCHIVED" ? ranking.archivedPenalty : 0;
    const conflictPenalty = memory.status === "CONFLICTED" ? ranking.conflictPenalty : 0;

    // Composite score
    const final =
        (bm25 + 0.1) * // +0.1 ensures non-zero base for non-keyword retrieval
            projectBoost *
            importanceWeight *
            recencyDecay *
            confidenceFactor *
            graphBoost -
        archivedPenalty -
        conflictPenalty;

    return {
        bm25,
        projectBoost,
        importanceWeight,
        recencyDecay,
        confidenceFactor,
        graphBoost,
        archivedPenalty,
        conflictPenalty,
        final: Math.max(final, 0),
    };
}

function getDaysSince(isoDate: string): number {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
}

function countSharedLinks(memory: MemoryMetadata, contextIds: string[]): number {
    // Count how many context memory IDs appear in this memory's related field
    const relatedSet = new Set(memory.related);
    return contextIds.filter((id) => relatedSet.has(id)).length;
}

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1);
}
