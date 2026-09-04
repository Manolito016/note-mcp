import { describe, it, expect } from "vitest";
import { jaccardSimilarity } from "./consolidation.js";

describe("Consolidation", () => {
    describe("jaccardSimilarity", () => {
        it("should return 1 for identical sets", () => {
            const a = new Set(["hello", "world"]);
            expect(jaccardSimilarity(a, a)).toBe(1);
        });

        it("should return 1 for two empty sets", () => {
            expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
        });

        it("should return 0 for completely disjoint sets", () => {
            const a = new Set(["a", "b"]);
            const b = new Set(["c", "d"]);
            expect(jaccardSimilarity(a, b)).toBe(0);
        });

        it("should return 0.5 for half overlap", () => {
            const a = new Set(["a", "b"]);
            const b = new Set(["b", "c"]);
            expect(jaccardSimilarity(a, b)).toBeCloseTo(1 / 3, 2);
        });

        it("should handle one empty set", () => {
            const a = new Set(["a"]);
            expect(jaccardSimilarity(a, new Set())).toBe(0);
        });

        it("should handle subset relationship", () => {
            const a = new Set(["a", "b", "c"]);
            const b = new Set(["a"]);
            // intersection = 1, union = 3, jaccard = 1/3
            expect(jaccardSimilarity(a, b)).toBeCloseTo(1 / 3, 2);
        });
    });
});
