import { describe, it, expect } from "vitest";
import {
    levenshteinDistance,
    fuzzyMatch,
    autoTolerance,
    parseSearchOperators,
    highlightMatches,
} from "./fuzzy-search.js";

// ─── Levenshtein Distance ────────────────────────────────────────────

describe("levenshteinDistance", () => {
    it("returns 0 for identical strings", () => {
        expect(levenshteinDistance("abc", "abc")).toBe(0);
    });

    it("returns length for empty string", () => {
        expect(levenshteinDistance("", "abc")).toBe(3);
        expect(levenshteinDistance("abc", "")).toBe(3);
    });

    it("counts single insertion", () => {
        expect(levenshteinDistance("cat", "cats")).toBe(1);
    });

    it("counts single deletion", () => {
        expect(levenshteinDistance("cats", "cat")).toBe(1);
    });

    it("counts single substitution", () => {
        expect(levenshteinDistance("cat", "bat")).toBe(1);
    });

    it("handles transposition (two edits)", () => {
        // "teh" → "the" = substitute t→h + h→t = 2, OR delete+insert = 2
        expect(levenshteinDistance("teh", "the")).toBe(2);
    });

    it("handles completely different strings", () => {
        expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    });

    it("is symmetric", () => {
        expect(levenshteinDistance("abc", "xyz")).toBe(levenshteinDistance("xyz", "abc"));
    });
});

// ─── autoTolerance ───────────────────────────────────────────────────

describe("autoTolerance", () => {
    it("returns 0 for short words (≤3)", () => {
        expect(autoTolerance(1)).toBe(0);
        expect(autoTolerance(2)).toBe(0);
        expect(autoTolerance(3)).toBe(0);
    });

    it("returns 1 for medium words (4-6)", () => {
        expect(autoTolerance(4)).toBe(1);
        expect(autoTolerance(5)).toBe(1);
        expect(autoTolerance(6)).toBe(1);
    });

    it("returns 2 for longer words (7-9)", () => {
        expect(autoTolerance(7)).toBe(2);
        expect(autoTolerance(8)).toBe(2);
        expect(autoTolerance(9)).toBe(2);
    });

    it("returns 3 for very long words (>9)", () => {
        expect(autoTolerance(10)).toBe(3);
        expect(autoTolerance(20)).toBe(3);
    });
});

// ─── fuzzyMatch ──────────────────────────────────────────────────────

describe("fuzzyMatch", () => {
    it("matches exact words", () => {
        expect(fuzzyMatch("hello", "say hello world")).toBe(true);
    });

    it("matches with one typo (medium word)", () => {
        // "tempalte" → "template" = 1 transposition (2 edits), tolerance for 8-char word = 2
        expect(fuzzyMatch("tempalte", "read the template file")).toBe(true);
    });

    it("matches with one typo (short word)", () => {
        // "prd" → "prd" exact, tolerance for 3-char word = 0
        expect(fuzzyMatch("prd", "prd template")).toBe(true);
    });

    it("rejects when no match within tolerance", () => {
        // "xyz" is 3 chars → tolerance 0, no exact match in text
        expect(fuzzyMatch("xyz", "hello world")).toBe(false);
    });

    it("handles multi-word queries (AND logic)", () => {
        expect(fuzzyMatch("prd template", "PRD Template - Agentic AI")).toBe(true);
    });

    it("rejects multi-word if any term missing", () => {
        expect(fuzzyMatch("prd database", "PRD Template - Agentic AI")).toBe(false);
    });

    it("returns false for empty query", () => {
        expect(fuzzyMatch("", "hello")).toBe(false);
    });

    it("returns false for empty text", () => {
        expect(fuzzyMatch("hello", "")).toBe(false);
    });

    it("respects explicit tolerance", () => {
        // "cat" with tolerance 1 should match "bat" (1 edit)
        expect(fuzzyMatch("cat", "bat", 1)).toBe(true);
        // "cat" with tolerance 0 should NOT match "bat"
        expect(fuzzyMatch("cat", "bat", 0)).toBe(false);
    });
});

// ─── parseSearchOperators ────────────────────────────────────────────

describe("parseSearchOperators", () => {
    it("parses plain terms", () => {
        const result = parseSearchOperators("hello world");
        expect(result.terms).toEqual(["hello", "world"]);
        expect(result.hasOperators).toBe(false);
    });

    it("parses quoted phrases", () => {
        const result = parseSearchOperators('"exact phrase" other');
        expect(result.phrases).toEqual(["exact phrase"]);
        expect(result.terms).toEqual(["other"]);
        expect(result.hasOperators).toBe(true);
    });

    it("parses tag: filters", () => {
        const result = parseSearchOperators("tag:prd template");
        expect(result.tags).toEqual(["prd"]);
        expect(result.terms).toEqual(["template"]);
        expect(result.hasOperators).toBe(true);
    });

    it("parses path: filters", () => {
        const result = parseSearchOperators("path:plugin/prime search");
        expect(result.paths).toEqual(["plugin/prime"]);
        expect(result.terms).toEqual(["search"]);
        expect(result.hasOperators).toBe(true);
    });

    it("parses -exclude terms", () => {
        const result = parseSearchOperators("template -deprecated");
        expect(result.terms).toEqual(["template"]);
        expect(result.excludes).toEqual(["deprecated"]);
        expect(result.hasOperators).toBe(true);
    });

    it("parses complex combined queries", () => {
        const result = parseSearchOperators('tag:prd path:plugin "agent pipeline" -draft');
        expect(result.tags).toEqual(["prd"]);
        expect(result.paths).toEqual(["plugin"]);
        expect(result.phrases).toEqual(["agent pipeline"]);
        expect(result.excludes).toEqual(["draft"]);
        expect(result.terms).toEqual([]);
        expect(result.hasOperators).toBe(true);
    });

    it("normalises tags to lowercase", () => {
        const result = parseSearchOperators("tag:PRD");
        expect(result.tags).toEqual(["prd"]);
    });

    it("handles multiple tags", () => {
        const result = parseSearchOperators("tag:prd tag:template");
        expect(result.tags).toEqual(["prd", "template"]);
    });

    it("does not treat lone dash as exclude", () => {
        const result = parseSearchOperators("-");
        expect(result.excludes).toEqual([]);
        expect(result.terms).toEqual(["-"]);
    });
});

// ─── highlightMatches ────────────────────────────────────────────────

describe("highlightMatches", () => {
    it("wraps matched text in bold markers", () => {
        const result = highlightMatches("PRD Template file", ["PRD"]);
        expect(result).toBe("**PRD** Template file");
    });

    it("is case-insensitive", () => {
        const result = highlightMatches("prd template", ["PRD"]);
        expect(result).toBe("**prd** template");
    });

    it("highlights multiple patterns", () => {
        const result = highlightMatches("PRD Template file", ["PRD", "Template"]);
        expect(result).toBe("**PRD** **Template** file");
    });

    it("highlights all occurrences", () => {
        const result = highlightMatches("cat and cat", ["cat"]);
        expect(result).toBe("**cat** and **cat**");
    });

    it("returns original text when no match", () => {
        const result = highlightMatches("hello world", ["xyz"]);
        expect(result).toBe("hello world");
    });

    it("returns original text for empty patterns", () => {
        const result = highlightMatches("hello world", []);
        expect(result).toBe("hello world");
    });

    it("escapes regex special characters in patterns", () => {
        const result = highlightMatches("file (v2).md", ["(v2)"]);
        expect(result).toBe("file **(v2)**.md");
    });
});
