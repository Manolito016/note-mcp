import { describe, it, expect } from "vitest";
import { jaccardSimilarity, normalizeToTokens } from "./consolidation.js";

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

    describe("normalizeToTokens", () => {
        it("strips stopwords and lowercases", () => {
            const tokens = normalizeToTokens("The quick brown fox is a fast animal");
            expect(tokens.has("the")).toBe(false);
            expect(tokens.has("is")).toBe(false);
            expect(tokens.has("a")).toBe(false);
            expect(tokens.has("quick")).toBe(true);
            expect(tokens.has("brown")).toBe(true);
            expect(tokens.has("fox")).toBe(true);
        });

        it("generates bigrams for phrase detection", () => {
            const tokens = normalizeToTokens("database connection pool");
            expect(tokens.has("database connection")).toBe(true);
            expect(tokens.has("connection pool")).toBe(true);
            expect(tokens.has("database")).toBe(true);
            expect(tokens.has("pool")).toBe(true);
        });

        it("strips markdown syntax", () => {
            const tokens = normalizeToTokens("# Heading\n**bold** text\n- list item\n`code`");
            expect(tokens.has("heading")).toBe(true);
            expect(tokens.has("bold")).toBe(true);
            expect(tokens.has("text")).toBe(true);
            expect(tokens.has("list")).toBe(true);
            expect(tokens.has("item")).toBe(true);
            // "code" is stripped by the inline-code regex (`...`)
            expect(tokens.has("code")).toBe(false);
        });

        it("strips frontmatter markers", () => {
            const tokens = normalizeToTokens("---\ntitle: Test\ntags: [a, b]\n---\nContent here");
            expect(tokens.has("title")).toBe(false);
            expect(tokens.has("content")).toBe(true);
            // "here" is a stopword
            expect(tokens.has("here")).toBe(false);
        });

        it("strips code blocks", () => {
            const tokens = normalizeToTokens("Before\n```ts\nconst x = 1;\n```\nAfter");
            // "before" and "after" are stopwords
            expect(tokens.has("before")).toBe(false);
            expect(tokens.has("after")).toBe(false);
            expect(tokens.has("const")).toBe(false);
        });

        it("produces similar tokens for semantically equivalent text", () => {
            const a = normalizeToTokens("The database uses PostgreSQL for storage");
            const b = normalizeToTokens("PostgreSQL is used by the database for storage");
            // Both should share key terms and bigrams will differ due to word order
            expect(a.has("database")).toBe(true);
            expect(b.has("database")).toBe(true);
            expect(a.has("postgresql")).toBe(true);
            expect(b.has("postgresql")).toBe(true);
            expect(a.has("storage")).toBe(true);
            expect(b.has("storage")).toBe(true);
        });

        it("returns empty set for stopword-only text", () => {
            const tokens = normalizeToTokens("the a an is are was were");
            expect(tokens.size).toBe(0);
        });

        it("filters single-character tokens", () => {
            const tokens = normalizeToTokens("I a b c hello");
            expect(tokens.has("i")).toBe(false);
            expect(tokens.has("a")).toBe(false);
            expect(tokens.has("b")).toBe(false);
            expect(tokens.has("hello")).toBe(true);
        });
    });
});
