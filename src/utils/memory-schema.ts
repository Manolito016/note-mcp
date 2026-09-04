/**
 * Memory schema definitions — Zod schemas, enums, validation, and defaults.
 * Defines the 16 memory types, lifecycle statuses, source types, importance levels,
 * and confidence scoring for the Quill memory intelligence layer.
 */

import { z } from "zod";
import { generateMemoryId, isValidMemoryId } from "./memory-id.js";

// === ENUMS ===

export const MEMORY_TYPES = [
    "FACT",
    "PREFERENCE",
    "REQUIREMENT",
    "CONSTRAINT",
    "DECISION",
    "ARCHITECTURE",
    "PROJECT_STATE",
    "TASK_STATE",
    "DISCOVERY",
    "LESSON",
    "ERROR",
    "SOLUTION",
    "INSTRUCTION",
    "CONTEXT",
    "RELATIONSHIP",
    "SESSION",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const MEMORY_STATUSES = [
    "ACTIVE",
    "CONFIRMED",
    "DEPRECATED",
    "SUPERSEDED",
    "CONFLICTED",
    "REJECTED",
    "EXPIRED",
    "ARCHIVED",
] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const SOURCE_TYPES = [
    "USER",
    "AGENT",
    "TOOL",
    "FILE",
    "DOCUMENT",
    "CODE",
    "WEB",
    "SYSTEM",
    "INFERENCE",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const IMPORTANCE_LEVELS = ["CRITICAL", "HIGH", "NORMAL", "LOW", "EPHEMERAL"] as const;
export type Importance = (typeof IMPORTANCE_LEVELS)[number];

export type ConfidenceBand = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

// === INTERFACES ===

export interface MemoryFrontmatter {
    id: string;
    type: MemoryType;
    status: MemoryStatus;
    confidence: number;
    project: string;
    created: string;
    updated: string;
    source_type: SourceType;
    source_reference?: string;
    importance: Importance;
    entity?: string;
    supersedes?: string;
    superseded_by?: string;
    related: string[];
    tags: string[];
}

export interface MemoryMetadata extends MemoryFrontmatter {
    filePath: string;
    contentPreview: string;
    wordCount: number;
    lastIndexed: string;
}

// === ZOD SCHEMAS ===

export const memoryTypeSchema = z.enum(MEMORY_TYPES);
export const memoryStatusSchema = z.enum(MEMORY_STATUSES);
export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export const importanceSchema = z.enum(IMPORTANCE_LEVELS);

export const memoryFrontmatterSchema = z.object({
    id: z.string().refine(isValidMemoryId, { message: "Invalid memory ID format (expected mem_<ULID>)" }),
    type: memoryTypeSchema,
    status: memoryStatusSchema.default("ACTIVE"),
    confidence: z.number().min(0).max(1),
    project: z.string().min(1, "Project cannot be empty"),
    created: z.string().datetime({ offset: true }),
    updated: z.string().datetime({ offset: true }),
    source_type: sourceTypeSchema.default("AGENT"),
    source_reference: z.string().optional(),
    importance: importanceSchema.default("NORMAL"),
    entity: z.string().optional(),
    supersedes: z.string().optional(),
    superseded_by: z.string().optional(),
    related: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
});

// Partial schema for creating new memories (id, created, updated are auto-generated)
export const createMemorySchema = z.object({
    type: memoryTypeSchema,
    project: z.string().min(1),
    confidence: z.number().min(0).max(1).optional(),
    source_type: sourceTypeSchema.default("AGENT"),
    source_reference: z.string().optional(),
    importance: importanceSchema.default("NORMAL"),
    entity: z.string().optional(),
    tags: z.array(z.string()).optional(),
    related: z.array(z.string()).optional(),
});

// === VALIDATION ===

export interface ValidationResult<T> {
    success: boolean;
    data?: T;
    errors?: Array<{ field: string; message: string }>;
}

/**
 * Validate memory frontmatter against the schema.
 */
export function validateMemoryFrontmatter(data: unknown): ValidationResult<MemoryFrontmatter> {
    const result = memoryFrontmatterSchema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data as MemoryFrontmatter };
    }
    return {
        success: false,
        errors: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
        })),
    };
}

// === CONFIDENCE ===

/**
 * Compute the confidence band for a given confidence score.
 */
export function computeConfidenceBand(confidence: number): ConfidenceBand {
    if (confidence < 0.4) return "LOW";
    if (confidence < 0.7) return "MEDIUM";
    if (confidence < 0.9) return "HIGH";
    return "VERY_HIGH";
}

/**
 * Get the default confidence for a given source type.
 * User-confirmed statements get high confidence; inferences get lower.
 */
export function getDefaultConfidence(sourceType: SourceType): number {
    switch (sourceType) {
        case "USER":
            return 0.95;
        case "DOCUMENT":
        case "CODE":
            return 0.9;
        case "AGENT":
        case "TOOL":
        case "FILE":
        case "SYSTEM":
        case "WEB":
            return 0.8;
        case "INFERENCE":
            return 0.65;
        default:
            return 0.8;
    }
}

// === DEFAULTS ===

/**
 * Apply defaults to a partial memory frontmatter, generating missing fields.
 */
export function applyDefaults(partial: Partial<MemoryFrontmatter>): MemoryFrontmatter {
    const now = new Date().toISOString();
    const sourceType = partial.source_type ?? "AGENT";

    return {
        id: partial.id ?? generateMemoryId(),
        type: partial.type ?? "FACT",
        status: partial.status ?? "ACTIVE",
        confidence: partial.confidence ?? getDefaultConfidence(sourceType),
        project: partial.project ?? "default",
        created: partial.created ?? now,
        updated: partial.updated ?? now,
        source_type: sourceType,
        source_reference: partial.source_reference,
        importance: partial.importance ?? "NORMAL",
        entity: partial.entity,
        supersedes: partial.supersedes,
        superseded_by: partial.superseded_by,
        related: partial.related ?? [],
        tags: partial.tags ?? [],
    };
}

/**
 * Check if a frontmatter object represents a typed memory (has required memory fields).
 */
export function isMemoryFrontmatter(frontmatter: Record<string, unknown>): boolean {
    return (
        typeof frontmatter.id === "string" &&
        typeof frontmatter.type === "string" &&
        MEMORY_TYPES.includes(frontmatter.type as MemoryType)
    );
}
