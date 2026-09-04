/**
 * Memory consolidation engine.
 * Merges duplicates, promotes important memories, and archives obsolete ones.
 * All actions are logged in the audit trail. Safety rules prevent data loss.
 */

import { metadataIndex } from "./metadata-index.js";
import { logAuditEntry } from "./audit-log.js";
import { getConfig } from "./config.js";
import type { MemoryMetadata, Importance } from "./memory-schema.js";

export type ConsolidationAction = "merge_duplicates" | "promote_important" | "archive_obsolete";

export interface ConsolidationInput {
    project: string;
    action: ConsolidationAction;
    confirm?: boolean;
}

export interface ConsolidationResult {
    action: ConsolidationAction;
    candidatesFound: number;
    actionsTaken: Array<{
        type: "merged" | "promoted" | "archived" | "suggested";
        memoryIds: string[];
        reason: string;
    }>;
    suggestions: Array<{
        type: "promote" | "archive";
        memoryId: string;
        reason: string;
        currentImportance?: Importance;
        suggestedImportance?: Importance;
    }>;
}

/**
 * Run a consolidation action on a project's memories.
 */
export async function consolidate(input: ConsolidationInput): Promise<ConsolidationResult> {
    if (!metadataIndex.isInitialized()) {
        await metadataIndex.initialize();
    }

    switch (input.action) {
        case "merge_duplicates":
            return mergeDuplicates(input.project, input.confirm ?? false);
        case "promote_important":
            return promoteImportant(input.project, input.confirm ?? false);
        case "archive_obsolete":
            return archiveObsolete(input.project, input.confirm ?? false);
    }
}

/**
 * Compute Jaccard similarity between two sets.
 */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 1;
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Normalize text for comparison: lowercase, strip markdown/punctuation,
 * remove stopwords, and generate word bigrams for better phrase detection.
 * Returns a set of tokens suitable for Jaccard comparison.
 */
export function normalizeToTokens(text: string): Set<string> {
    const STOPWORDS = new Set([
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "shall", "can", "need", "dare", "ought",
        "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
        "as", "into", "through", "during", "before", "after", "above",
        "below", "between", "out", "off", "over", "under", "again",
        "further", "then", "once", "and", "but", "or", "nor", "not", "so",
        "yet", "both", "either", "neither", "here", "there", "when", "where",
        "why", "how", "all", "each", "every", "that", "this", "these",
        "those", "it", "its", "my", "your", "our", "their", "he", "she",
        "they", "we", "you", "i", "me", "him", "her", "us", "them",
    ]);

    // Strip markdown, code blocks, YAML frontmatter markers
    const cleaned = text
        .replace(/^---[\s\S]*?---/m, "") // frontmatter
        .replace(/```[\s\S]*?```/g, "") // code blocks
        .replace(/`[^`]*`/g, "") // inline code
        .replace(/[#*_>~\[\]()!|]/g, " ") // markdown syntax
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    const words = cleaned
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOPWORDS.has(w));

    // Generate unigrams + bigrams for phrase-aware comparison
    const tokens = new Set<string>(words);
    for (let i = 0; i < words.length - 1; i++) {
        tokens.add(`${words[i]} ${words[i + 1]}`);
    }
    return tokens;
}

// === INTERNAL ===

async function mergeDuplicates(project: string, confirm: boolean): Promise<ConsolidationResult> {
    const config = getConfig();
    const threshold = config.consolidation.jaccardThreshold;

    const memories = metadataIndex.query({
        project,
        status: ["ACTIVE", "CONFIRMED"],
    });

    const result: ConsolidationResult = {
        action: "merge_duplicates",
        candidatesFound: 0,
        actionsTaken: [],
        suggestions: [],
    };

    // Compare all pairs within each type group
    const byType = new Map<string, MemoryMetadata[]>();
    for (const mem of memories) {
        if (!byType.has(mem.type)) byType.set(mem.type, []);
        byType.get(mem.type)!.push(mem);
    }

    for (const [, group] of byType) {
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const wordsA = normalizeToTokens(group[i].contentPreview);
                const wordsB = normalizeToTokens(group[j].contentPreview);
                const similarity = jaccardSimilarity(wordsA, wordsB);

                if (similarity >= threshold) {
                    result.candidatesFound++;

                    // Determine keeper (higher confidence, more recent)
                    const keeper = group[i].confidence >= group[j].confidence ? group[i] : group[j];
                    const other = keeper === group[i] ? group[j] : group[i];

                    if (confirm) {
                        // Log the merge action
                        await logAuditEntry({
                            actor: "agent",
                            memoryId: other.id,
                            action: "consolidate_merge",
                            previousState: { status: other.status },
                            newState: { status: "SUPERSEDED", superseded_by: keeper.id },
                            reason: `Consolidation: merged with ${keeper.id} (Jaccard: ${similarity.toFixed(2)})`,
                        });

                        result.actionsTaken.push({
                            type: "merged",
                            memoryIds: [keeper.id, other.id],
                            reason: `Jaccard similarity: ${similarity.toFixed(2)} — "${other.id}" superseded by "${keeper.id}"`,
                        });
                    } else {
                        result.suggestions.push({
                            type: "archive",
                            memoryId: other.id,
                            reason: `Jaccard similarity: ${similarity.toFixed(2)} with ${keeper.id}`,
                        });
                    }
                }
            }
        }
    }

    return result;
}

async function promoteImportant(project: string, confirm: boolean): Promise<ConsolidationResult> {
    const config = getConfig();
    const refThreshold = config.consolidation.promotionReferenceThreshold;
    const confThreshold = config.consolidation.promotionConfidenceThreshold;

    const memories = metadataIndex.query({
        project,
        status: ["ACTIVE", "CONFIRMED"],
    });

    const result: ConsolidationResult = {
        action: "promote_important",
        candidatesFound: 0,
        actionsTaken: [],
        suggestions: [],
    };

    for (const mem of memories) {
        // Check if memory is referenced by others
        const referencedBy = memories.filter((other) => other.related.includes(mem.id));

        if (referencedBy.length >= refThreshold && mem.confidence >= confThreshold && mem.importance === "NORMAL") {
            result.candidatesFound++;

            if (confirm) {
                await logAuditEntry({
                    actor: "agent",
                    memoryId: mem.id,
                    action: "consolidate_promote",
                    previousState: { importance: "NORMAL" },
                    newState: { importance: "HIGH" },
                    reason: `Promoted: referenced by ${referencedBy.length} memories, confidence ${mem.confidence}`,
                });

                result.actionsTaken.push({
                    type: "promoted",
                    memoryIds: [mem.id],
                    reason: `Referenced by ${referencedBy.length} memories, confidence ${mem.confidence}`,
                });
            } else {
                result.suggestions.push({
                    type: "promote",
                    memoryId: mem.id,
                    reason: `Referenced by ${referencedBy.length} memories, confidence ${mem.confidence}`,
                    currentImportance: "NORMAL",
                    suggestedImportance: "HIGH",
                });
            }
        }
    }

    return result;
}

async function archiveObsolete(project: string, confirm: boolean): Promise<ConsolidationResult> {
    const config = getConfig();
    const staleDays = config.consolidation.staleDays;
    const lowConfThreshold = config.consolidation.lowConfidenceThreshold;

    const memories = metadataIndex.query({
        project,
        status: ["ACTIVE", "CONFIRMED"],
    });

    const result: ConsolidationResult = {
        action: "archive_obsolete",
        candidatesFound: 0,
        actionsTaken: [],
        suggestions: [],
    };

    const now = Date.now();

    for (const mem of memories) {
        const daysSinceUpdate = (now - new Date(mem.updated).getTime()) / (1000 * 60 * 60 * 24);
        const isStale = daysSinceUpdate > staleDays;
        const isLowConfidence = mem.confidence <= lowConfThreshold;

        if (isStale || isLowConfidence) {
            result.candidatesFound++;
            const reason = isLowConfidence
                ? `Low confidence: ${mem.confidence}`
                : `Stale: ${Math.round(daysSinceUpdate)} days since update`;

            if (confirm) {
                await logAuditEntry({
                    actor: "agent",
                    memoryId: mem.id,
                    action: "consolidate_archive",
                    previousState: { status: mem.status },
                    newState: { status: "ARCHIVED" },
                    reason,
                });

                result.actionsTaken.push({
                    type: "archived",
                    memoryIds: [mem.id],
                    reason,
                });
            } else {
                result.suggestions.push({
                    type: "archive",
                    memoryId: mem.id,
                    reason,
                });
            }
        }
    }

    return result;
}
