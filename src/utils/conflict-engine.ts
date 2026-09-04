/**
 * Field-based conflict detection engine.
 * Detects contradictory memories by comparing same-entity memories within a project.
 * Conservative approach: flags potential conflicts, requires agent/human confirmation.
 */

import { metadataIndex } from "./metadata-index.js";
import { logAuditEntry } from "./audit-log.js";
import type { MemoryMetadata, MemoryType, MemoryStatus, MemoryFrontmatter } from "./memory-schema.js";

export interface ConflictPair {
    memoryA: MemoryMetadata;
    memoryB: MemoryMetadata;
    conflictingEntity: string;
    reason: string;
    severity: "potential" | "likely" | "definite";
}

export interface ConflictDetectionResult {
    conflicts: ConflictPair[];
    scannedCount: number;
    project: string;
}

export type ResolutionAction = "supersede" | "reject" | "manual_review";

export interface ResolutionResult {
    success: boolean;
    action: ResolutionAction;
    memoryA: { id: string; newStatus: MemoryStatus };
    memoryB: { id: string; newStatus: MemoryStatus };
    auditEntries: number;
}

/**
 * Detect conflicts among active memories in a project.
 * Compares memories with the same entity to find contradictory values.
 */
export async function detectConflicts(project: string, type?: MemoryType): Promise<ConflictDetectionResult> {
    if (!metadataIndex.isInitialized()) {
        await metadataIndex.initialize();
    }

    const filter: { project: string; type?: MemoryType; status: MemoryStatus[] } = {
        project,
        status: ["ACTIVE", "CONFIRMED"],
    };
    if (type) filter.type = type;

    const memories = metadataIndex.query(filter);
    const conflicts: ConflictPair[] = [];

    // Group memories by entity
    const byEntity = new Map<string, MemoryMetadata[]>();
    for (const memory of memories) {
        if (!memory.entity) continue;
        const key = memory.entity.toLowerCase();
        if (!byEntity.has(key)) {
            byEntity.set(key, []);
        }
        byEntity.get(key)!.push(memory);
    }

    // Check each entity group for conflicts
    for (const [entity, group] of byEntity) {
        if (group.length < 2) continue;

        // Compare all pairs
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const conflict = checkPairConflict(group[i], group[j], entity);
                if (conflict) {
                    conflicts.push(conflict);
                }
            }
        }
    }

    return {
        conflicts,
        scannedCount: memories.length,
        project,
    };
}

/**
 * Check if a new memory conflicts with existing memories.
 */
export async function checkConflicts(newMemory: MemoryFrontmatter): Promise<ConflictPair[]> {
    if (!metadataIndex.isInitialized()) {
        await metadataIndex.initialize();
    }

    if (!newMemory.entity) return [];

    const existing = metadataIndex.getByEntity(newMemory.entity);
    const conflicts: ConflictPair[] = [];

    for (const mem of existing) {
        if (mem.id === newMemory.id) continue;
        if (mem.status !== "ACTIVE" && mem.status !== "CONFIRMED") continue;
        if (mem.project.toLowerCase() !== newMemory.project.toLowerCase()) continue;

        // Create a temporary metadata-like object for comparison
        const tempMeta: MemoryMetadata = {
            ...newMemory,
            filePath: "",
            contentPreview: "",
            wordCount: 0,
            lastIndexed: "",
        };

        const conflict = checkPairConflict(mem, tempMeta, newMemory.entity);
        if (conflict) {
            conflicts.push(conflict);
        }
    }

    return conflicts;
}

/**
 * Resolve a conflict between two memories.
 */
export async function resolveConflict(
    memoryIdA: string,
    memoryIdB: string,
    action: ResolutionAction,
    keeperId?: string,
    reason?: string,
): Promise<ResolutionResult> {
    const memA = metadataIndex.getById(memoryIdA);
    const memB = metadataIndex.getById(memoryIdB);

    if (!memA || !memB) {
        throw new Error(`Cannot resolve conflict: memory not found (${!memA ? memoryIdA : memoryIdB})`);
    }

    let newStatusA: MemoryStatus = memA.status;
    let newStatusB: MemoryStatus = memB.status;

    switch (action) {
        case "supersede": {
            // Keeper stays ACTIVE, other becomes SUPERSEDED
            const keeper = keeperId ?? memoryIdA;
            if (keeper === memoryIdA) {
                newStatusA = "ACTIVE";
                newStatusB = "SUPERSEDED";
            } else {
                newStatusA = "SUPERSEDED";
                newStatusB = "ACTIVE";
            }
            break;
        }
        case "reject": {
            newStatusA = "REJECTED";
            newStatusB = "REJECTED";
            break;
        }
        case "manual_review": {
            newStatusA = "CONFLICTED";
            newStatusB = "CONFLICTED";
            break;
        }
    }

    // Log audit entries
    await logAuditEntry({
        actor: "agent",
        memoryId: memoryIdA,
        action: "resolve",
        previousState: { status: memA.status },
        newState: { status: newStatusA },
        reason: reason ?? `Conflict resolution: ${action}`,
    });
    await logAuditEntry({
        actor: "agent",
        memoryId: memoryIdB,
        action: "resolve",
        previousState: { status: memB.status },
        newState: { status: newStatusB },
        reason: reason ?? `Conflict resolution: ${action}`,
    });

    return {
        success: true,
        action,
        memoryA: { id: memoryIdA, newStatus: newStatusA },
        memoryB: { id: memoryIdB, newStatus: newStatusB },
        auditEntries: 2,
    };
}

/**
 * Get the supersession chain for a memory (tracing back through supersedes links).
 */
export async function getSupersessionChain(memoryId: string): Promise<string[]> {
    const chain: string[] = [memoryId];
    let current = metadataIndex.getById(memoryId);
    const visited = new Set<string>([memoryId]);

    while (current?.supersedes) {
        if (visited.has(current.supersedes)) break; // Prevent cycles
        chain.push(current.supersedes);
        visited.add(current.supersedes);
        current = metadataIndex.getById(current.supersedes);
        if (!current) break;
    }

    return chain;
}

// === INTERNAL ===

function checkPairConflict(a: MemoryMetadata, b: MemoryMetadata, entity: string): ConflictPair | null {
    // Same type, same project, same entity — check for content contradictions
    if (a.type !== b.type) return null;

    // Compare content previews for contradictions
    const previewA = a.contentPreview.toLowerCase().trim();
    const previewB = b.contentPreview.toLowerCase().trim();

    if (previewA === previewB) return null; // Same content, not a conflict

    // Check for common contradiction patterns
    const severity = assessSeverity(a, b, entity);

    return {
        memoryA: a,
        memoryB: b,
        conflictingEntity: entity,
        reason: `Both memories reference entity "${entity}" with type ${a.type} but have different content`,
        severity,
    };
}

function assessSeverity(a: MemoryMetadata, b: MemoryMetadata, _entity: string): ConflictPair["severity"] {
    // DECISION or CONSTRAINT conflicts are more serious
    if (a.type === "DECISION" || a.type === "CONSTRAINT" || a.type === "ARCHITECTURE") {
        return "likely";
    }

    // Different confidence levels suggest one may be outdated
    if (Math.abs(a.confidence - b.confidence) > 0.3) {
        return "potential";
    }

    // Same confidence = likely a real conflict
    if (Math.abs(a.confidence - b.confidence) < 0.1) {
        return "likely";
    }

    return "potential";
}
