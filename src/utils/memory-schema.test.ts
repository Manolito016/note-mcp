import { describe, it, expect } from "vitest";
import {
    MEMORY_TYPES,
    MEMORY_STATUSES,
    SOURCE_TYPES,
    IMPORTANCE_LEVELS,
    validateMemoryFrontmatter,
    computeConfidenceBand,
    getDefaultConfidence,
    applyDefaults,
    isMemoryFrontmatter,
} from "./memory-schema.js";
import { generateMemoryId } from "./memory-id.js";

describe("Memory Schema", () => {
    describe("enums", () => {
        it("should have 16 memory types", () => {
            expect(MEMORY_TYPES).toHaveLength(16);
            expect(MEMORY_TYPES).toContain("DECISION");
            expect(MEMORY_TYPES).toContain("FACT");
            expect(MEMORY_TYPES).toContain("SESSION");
        });

        it("should have 8 statuses", () => {
            expect(MEMORY_STATUSES).toHaveLength(8);
            expect(MEMORY_STATUSES).toContain("ACTIVE");
            expect(MEMORY_STATUSES).toContain("ARCHIVED");
        });

        it("should have 9 source types", () => {
            expect(SOURCE_TYPES).toHaveLength(9);
        });

        it("should have 5 importance levels", () => {
            expect(IMPORTANCE_LEVELS).toHaveLength(5);
        });
    });

    describe("validateMemoryFrontmatter", () => {
        const validData = {
            id: generateMemoryId(),
            type: "DECISION",
            status: "ACTIVE",
            confidence: 0.9,
            project: "test-project",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            source_type: "AGENT",
            importance: "NORMAL",
            related: [],
            tags: [],
        };

        it("should accept valid frontmatter", () => {
            const result = validateMemoryFrontmatter(validData);
            expect(result.success).toBe(true);
        });

        it("should reject invalid memory type", () => {
            const result = validateMemoryFrontmatter({ ...validData, type: "INVALID" });
            expect(result.success).toBe(false);
        });

        it("should reject confidence out of range", () => {
            const result = validateMemoryFrontmatter({ ...validData, confidence: 1.5 });
            expect(result.success).toBe(false);
        });

        it("should reject empty project", () => {
            const result = validateMemoryFrontmatter({ ...validData, project: "" });
            expect(result.success).toBe(false);
        });

        it("should reject invalid ID format", () => {
            const result = validateMemoryFrontmatter({ ...validData, id: "bad-id" });
            expect(result.success).toBe(false);
        });

        it("should apply default status if missing", () => {
            const { status: _unused, ...noStatus } = validData;
            void _unused;
            const result = validateMemoryFrontmatter(noStatus);
            expect(result.success).toBe(true);
            if (result.success && result.data) {
                expect(result.data.status).toBe("ACTIVE");
            }
        });
    });

    describe("computeConfidenceBand", () => {
        it("should return LOW for < 0.4", () => {
            expect(computeConfidenceBand(0.1)).toBe("LOW");
            expect(computeConfidenceBand(0.39)).toBe("LOW");
        });

        it("should return MEDIUM for 0.4–0.69", () => {
            expect(computeConfidenceBand(0.4)).toBe("MEDIUM");
            expect(computeConfidenceBand(0.69)).toBe("MEDIUM");
        });

        it("should return HIGH for 0.7–0.89", () => {
            expect(computeConfidenceBand(0.7)).toBe("HIGH");
            expect(computeConfidenceBand(0.89)).toBe("HIGH");
        });

        it("should return VERY_HIGH for >= 0.9", () => {
            expect(computeConfidenceBand(0.9)).toBe("VERY_HIGH");
            expect(computeConfidenceBand(1.0)).toBe("VERY_HIGH");
        });
    });

    describe("getDefaultConfidence", () => {
        it("should return 0.95 for USER", () => {
            expect(getDefaultConfidence("USER")).toBe(0.95);
        });

        it("should return 0.9 for DOCUMENT and CODE", () => {
            expect(getDefaultConfidence("DOCUMENT")).toBe(0.9);
            expect(getDefaultConfidence("CODE")).toBe(0.9);
        });

        it("should return 0.65 for INFERENCE", () => {
            expect(getDefaultConfidence("INFERENCE")).toBe(0.65);
        });

        it("should return 0.8 for AGENT", () => {
            expect(getDefaultConfidence("AGENT")).toBe(0.8);
        });
    });

    describe("applyDefaults", () => {
        it("should generate ID if missing", () => {
            const result = applyDefaults({});
            expect(result.id).toMatch(/^mem_/);
        });

        it("should set status to ACTIVE by default", () => {
            const result = applyDefaults({});
            expect(result.status).toBe("ACTIVE");
        });

        it("should set type to FACT by default", () => {
            const result = applyDefaults({});
            expect(result.type).toBe("FACT");
        });

        it("should generate timestamps", () => {
            const result = applyDefaults({});
            expect(result.created).toBeTruthy();
            expect(result.updated).toBeTruthy();
        });

        it("should preserve provided values", () => {
            const result = applyDefaults({ type: "DECISION", project: "my-project", importance: "HIGH" });
            expect(result.type).toBe("DECISION");
            expect(result.project).toBe("my-project");
            expect(result.importance).toBe("HIGH");
        });
    });

    describe("isMemoryFrontmatter", () => {
        it("should return true for objects with id and valid type", () => {
            expect(isMemoryFrontmatter({ id: "mem_01ARZMY7X51XK2JW9YPB5CVDGM", type: "FACT" })).toBe(true);
        });

        it("should return false for objects without id", () => {
            expect(isMemoryFrontmatter({ type: "FACT" })).toBe(false);
        });

        it("should return false for invalid type", () => {
            expect(isMemoryFrontmatter({ id: "mem_123", type: "INVALID" })).toBe(false);
        });
    });
});
