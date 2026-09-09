/**
 * Unit tests for token estimation utilities.
 * Tests character-based, word-based, and structured token counting.
 */
import { describe, it, expect } from "vitest";
import { estimateTokens, estimateTokensByWords, estimateResultTokens, formatTokenEstimate } from "./tokens.js";

describe("Tokens", () => {
    describe("estimateTokens", () => {
        it("returns 0 for empty string", () => {
            expect(estimateTokens("")).toBe(0);
        });

        it("returns 0 for falsy input", () => {
            expect(estimateTokens(null as unknown as string)).toBe(0);
            expect(estimateTokens(undefined as unknown as string)).toBe(0);
        });

        it("estimates ~4 chars per token", () => {
            expect(estimateTokens("abcd")).toBe(1); // 4 chars = 1 token
            expect(estimateTokens("abcdefgh")).toBe(2); // 8 chars = 2 tokens
        });

        it("ceils partial tokens", () => {
            expect(estimateTokens("a")).toBe(1); // 1 char = ceil(0.25) = 1
            expect(estimateTokens("abc")).toBe(1); // 3 chars = ceil(0.75) = 1
            expect(estimateTokens("abcde")).toBe(2); // 5 chars = ceil(1.25) = 2
        });

        it("handles long text", () => {
            const longText = "x".repeat(4000);
            expect(estimateTokens(longText)).toBe(1000);
        });
    });

    describe("estimateTokensByWords", () => {
        it("returns 0 for empty string", () => {
            expect(estimateTokensByWords("")).toBe(0);
        });

        it("estimates ~0.75 words per token", () => {
            // 3 words / 0.75 = 4 tokens
            expect(estimateTokensByWords("hello world foo")).toBe(4);
        });

        it("handles single word", () => {
            // 1 word / 0.75 = ceil(1.33) = 2 tokens
            expect(estimateTokensByWords("hello")).toBe(2);
        });

        it("handles extra whitespace", () => {
            expect(estimateTokensByWords("  hello   world  ")).toBe(3);
        });

        it("ceils partial tokens", () => {
            // 2 words / 0.75 = ceil(2.67) = 3 tokens
            expect(estimateTokensByWords("hello world")).toBe(3);
        });
    });

    describe("estimateResultTokens", () => {
        it("handles string input", () => {
            expect(estimateResultTokens("hello")).toBe(estimateTokens("hello"));
        });

        it("handles object input by JSON-stringifying", () => {
            const data = { key: "value" };
            const json = JSON.stringify(data, null, 2);
            expect(estimateResultTokens(data)).toBe(estimateTokens(json));
        });

        it("handles array input", () => {
            const data = [1, 2, 3];
            const json = JSON.stringify(data, null, 2);
            expect(estimateResultTokens(data)).toBe(estimateTokens(json));
        });

        it("handles null input", () => {
            expect(estimateResultTokens(null)).toBe(estimateTokens("null"));
        });

        it("handles nested objects", () => {
            const data = { a: { b: { c: "deep" } } };
            const tokens = estimateResultTokens(data);
            expect(tokens).toBeGreaterThan(0);
        });
    });

    describe("formatTokenEstimate", () => {
        it("formats small counts as-is", () => {
            expect(formatTokenEstimate(50)).toBe("~50 tokens");
            expect(formatTokenEstimate(999)).toBe("~999 tokens");
        });

        it("formats thousands with one decimal", () => {
            expect(formatTokenEstimate(1500)).toBe("~1.5k tokens");
            expect(formatTokenEstimate(2300)).toBe("~2.3k tokens");
            expect(formatTokenEstimate(9999)).toBe("~10.0k tokens");
        });

        it("formats large thousands rounded", () => {
            expect(formatTokenEstimate(10000)).toBe("~10k tokens");
            expect(formatTokenEstimate(50000)).toBe("~50k tokens");
            expect(formatTokenEstimate(123456)).toBe("~123k tokens");
        });

        it("handles zero", () => {
            expect(formatTokenEstimate(0)).toBe("~0 tokens");
        });
    });
});
