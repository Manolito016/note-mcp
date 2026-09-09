/**
 * Unit tests for the configuration resolver.
 * Tests default config, file merging, and environment variable overrides.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getConfig, resetConfig, resolveConfig } from "./config.js";

describe("Config", () => {
    beforeEach(() => {
        resetConfig();
    });

    afterEach(() => {
        // Clean up environment variables
        delete process.env.QUILL_MEMORY_DISABLED;
        delete process.env.QUILL_MEMORIES_DIR;
        delete process.env.QUILL_RECENT_LAMBDA;
        resetConfig();
    });

    describe("resolveConfig", () => {
        it("returns default config when no file or env overrides exist", () => {
            const config = resolveConfig();
            expect(config.memory.enabled).toBe(true);
            expect(config.memory.directories.memories).toBe("memories");
            expect(config.ranking.bm25.k1).toBe(1.2);
            expect(config.ranking.bm25.b).toBe(0.75);
            expect(config.consolidation.jaccardThreshold).toBe(0.7);
            expect(config.audit.maxFileSizeMb).toBe(10);
        });

        it("caches config after first resolution", () => {
            const config1 = getConfig();
            const config2 = getConfig();
            expect(config1).toBe(config2); // Same reference
        });

        it("resetConfig clears the cache", () => {
            const config1 = getConfig();
            resetConfig();
            const config2 = getConfig();
            expect(config1).not.toBe(config2); // Different references after reset
        });
    });

    describe("environment variable overrides", () => {
        it("QUILL_MEMORY_DISABLED=true disables memory", () => {
            process.env.QUILL_MEMORY_DISABLED = "true";
            resetConfig();
            const config = getConfig();
            expect(config.memory.enabled).toBe(false);
        });

        it("QUILL_MEMORIES_DIR overrides memories directory", () => {
            process.env.QUILL_MEMORIES_DIR = "custom-memories";
            resetConfig();
            const config = getConfig();
            expect(config.memory.directories.memories).toBe("custom-memories");
        });

        it("QUILL_RECENT_LAMBDA overrides recency lambda", () => {
            process.env.QUILL_RECENT_LAMBDA = "0.05";
            resetConfig();
            const config = getConfig();
            expect(config.ranking.recencyLambda).toBe(0.05);
        });

        it("invalid QUILL_RECENT_LAMBDA is handled gracefully", () => {
            process.env.QUILL_RECENT_LAMBDA = "not-a-number";
            resetConfig();
            const config = getConfig();
            // parseFloat("not-a-number") returns NaN
            expect(Number.isNaN(config.ranking.recencyLambda)).toBe(true);
        });
    });

    describe("default config structure", () => {
        it("has all required ranking fields", () => {
            const config = getConfig();
            expect(config.ranking.projectBoost).toBeDefined();
            expect(config.ranking.projectMissPenalty).toBeDefined();
            expect(config.ranking.importanceWeights).toBeDefined();
            expect(config.ranking.importanceWeights.CRITICAL).toBeGreaterThan(1);
            expect(config.ranking.importanceWeights.HIGH).toBeGreaterThan(1);
            expect(config.ranking.importanceWeights.NORMAL).toBe(1.0);
            expect(config.ranking.importanceWeights.LOW).toBeLessThan(1);
            expect(config.ranking.importanceWeights.EPHEMERAL).toBeLessThan(1);
            expect(config.ranking.archivedPenalty).toBeGreaterThan(0);
            expect(config.ranking.conflictPenalty).toBeGreaterThan(0);
            expect(config.ranking.graphBoostFactor).toBeGreaterThan(0);
        });

        it("has all required consolidation fields", () => {
            const config = getConfig();
            expect(config.consolidation.jaccardThreshold).toBeGreaterThan(0);
            expect(config.consolidation.jaccardThreshold).toBeLessThanOrEqual(1);
            expect(config.consolidation.staleDays).toBeGreaterThan(0);
            expect(config.consolidation.lowConfidenceThreshold).toBeGreaterThan(0);
            expect(config.consolidation.promotionReferenceThreshold).toBeGreaterThan(0);
            expect(config.consolidation.promotionConfidenceThreshold).toBeGreaterThan(0);
        });

        it("has all required audit fields", () => {
            const config = getConfig();
            expect(config.audit.maxFileSizeMb).toBeGreaterThan(0);
            expect(typeof config.audit.rotationEnabled).toBe("boolean");
        });

        it("importance weights are ordered correctly", () => {
            const config = getConfig();
            const w = config.ranking.importanceWeights;
            expect(w.CRITICAL).toBeGreaterThan(w.HIGH);
            expect(w.HIGH).toBeGreaterThan(w.NORMAL);
            expect(w.NORMAL).toBeGreaterThan(w.LOW);
            expect(w.LOW).toBeGreaterThan(w.EPHEMERAL);
        });
    });
});
