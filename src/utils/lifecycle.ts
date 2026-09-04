/**
 * Memory lifecycle state machine.
 * Defines valid status transitions and provides transition validation.
 *
 * States: ACTIVE, CONFIRMED, DEPRECATED, SUPERSEDED, CONFLICTED, REJECTED, EXPIRED, ARCHIVED
 *
 * Transition rules:
 * - ACTIVE → CONFIRMED, DEPRECATED, SUPERSEDED, CONFLICTED, ARCHIVED
 * - CONFIRMED → DEPRECATED, SUPERSEDED, ARCHIVED
 * - DEPRECATED → ARCHIVED
 * - SUPERSEDED → (terminal, no forward transitions)
 * - CONFLICTED → ACTIVE, SUPERSEDED, REJECTED, ARCHIVED (requires resolution)
 * - REJECTED → ARCHIVED
 * - EXPIRED → ARCHIVED
 * - ARCHIVED → ACTIVE (resurrection requires evidence)
 */

import type { MemoryStatus } from "./memory-schema.js";

export interface TransitionResult {
    success: boolean;
    from: MemoryStatus;
    to: MemoryStatus;
    error?: string;
}

/**
 * Map of valid transitions.
 * Key: source status, Value: set of allowed target statuses.
 */
const VALID_TRANSITIONS: Record<MemoryStatus, Set<MemoryStatus>> = {
    ACTIVE: new Set(["CONFIRMED", "DEPRECATED", "SUPERSEDED", "CONFLICTED", "ARCHIVED"]),
    CONFIRMED: new Set(["DEPRECATED", "SUPERSEDED", "ARCHIVED"]),
    DEPRECATED: new Set(["ARCHIVED"]),
    SUPERSEDED: new Set(),
    CONFLICTED: new Set(["ACTIVE", "SUPERSEDED", "REJECTED", "ARCHIVED"]),
    REJECTED: new Set(["ARCHIVED"]),
    EXPIRED: new Set(["ARCHIVED"]),
    ARCHIVED: new Set(["ACTIVE"]), // Resurrection allowed with evidence
};

/**
 * Validate if a status transition is allowed.
 */
export function validateTransition(from: MemoryStatus, to: MemoryStatus, evidence?: string): TransitionResult {
    // Same status is always allowed (no-op)
    if (from === to) {
        return { success: true, from, to };
    }

    const allowed = VALID_TRANSITIONS[from];
    if (!allowed) {
        return { success: false, from, to, error: `Unknown source status: ${from}` };
    }

    if (!allowed.has(to)) {
        return {
            success: false,
            from,
            to,
            error: `Transition from ${from} to ${to} is not allowed. Valid targets: [${[...allowed].join(", ")}]`,
        };
    }

    // ARCHIVED → ACTIVE (resurrection) requires evidence
    if (from === "ARCHIVED" && to === "ACTIVE" && !evidence) {
        return {
            success: false,
            from,
            to,
            error: "Resurrection from ARCHIVED to ACTIVE requires explicit evidence/justification",
        };
    }

    return { success: true, from, to };
}

/**
 * Get all valid target states from a given current state.
 */
export function getAvailableTransitions(currentStatus: MemoryStatus): MemoryStatus[] {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed) return [];
    return [...allowed];
}

/**
 * Check if a status is considered "active" (not terminal).
 */
export function isActiveStatus(status: MemoryStatus): boolean {
    return status === "ACTIVE" || status === "CONFIRMED";
}

/**
 * Check if a status is terminal (no further transitions possible).
 */
export function isTerminalStatus(status: MemoryStatus): boolean {
    return status === "SUPERSEDED";
}

/**
 * Get a human-readable description of a status.
 */
export function describeStatus(status: MemoryStatus): string {
    const descriptions: Record<MemoryStatus, string> = {
        ACTIVE: "Currently active and valid",
        CONFIRMED: "Verified and confirmed by user or agent",
        DEPRECATED: "No longer relevant but preserved for history",
        SUPERSEDED: "Replaced by a newer memory",
        CONFLICTED: "Contradicts another memory — requires resolution",
        REJECTED: "Explicitly rejected as incorrect",
        EXPIRED: "Time-limited memory that has expired",
        ARCHIVED: "Moved to archive — requires evidence to resurrect",
    };
    return descriptions[status] ?? status;
}
