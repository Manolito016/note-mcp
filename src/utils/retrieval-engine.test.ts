/**
 * Unit tests for the smart retrieval engine.
 * Tests BM25 scoring, composite ranking, and filtering logic.
 */
import { describe, it, expect } from "vitest";
import { computeBm25Score } from "./retrieval-engine.js";
import type { InvertedIndex } from "./metadata-index.js";

describe("Retrieval Engine", () => {
    describe("computeBm25Score", () => {
        function makeIndex(overrides: Partial<InvertedIndex> = {}): InvertedIndex {
            return {
                postings: new Map(),
                docCount: 10,
                avgDocLength: 100,
                docLengths: new Map(),
                ...overrides,
            };
        }

        it("returns 0 for empty query tokens", () => {
            const index = makeIndex();
            const score = computeBm25Score("doc1", [], index, 1.5, 0.75);
            expect(score).toBe(0);
        });

        it("returns 0 when token not in index", () => {
            const posting = new Map([["doc1", { tf: 1 }]]);
            const index = makeIndex({
                postings: new Map([["other", posting]]),
            });
            const score = computeBm25Score("doc1", ["missing"], index, 1.5, 0.75);
            expect(score).toBe(0);
        });

        it("returns 0 when doc has no term frequency", () => {
            const posting = new Map([["doc2", { tf: 5 }]]);
            const index = makeIndex({
                postings: new Map([["term", posting]]),
                docCount: 10,
                avgDocLength: 100,
                docLengths: new Map([["doc1", 100]]),
            });
            const score = computeBm25Score("doc1", ["term"], index, 1.5, 0.75);
            expect(score).toBe(0);
        });

        it("computes positive score for matching document", () => {
            const posting = new Map([["doc1", { tf: 3 }]]);
            const index = makeIndex({
                postings: new Map([["search", posting]]),
                docCount: 100,
                avgDocLength: 50,
                docLengths: new Map([["doc1", 50]]),
            });
            const score = computeBm25Score("doc1", ["search"], index, 1.5, 0.75);
            expect(score).toBeGreaterThan(0);
        });

        it("higher TF produces higher score", () => {
            const postingLow = new Map([["doc1", { tf: 1 }]]);
            const postingHigh = new Map([["doc1", { tf: 10 }]]);

            const indexLow = makeIndex({
                postings: new Map([["term", postingLow]]),
                docCount: 100,
                avgDocLength: 50,
                docLengths: new Map([["doc1", 50]]),
            });
            const indexHigh = makeIndex({
                postings: new Map([["term", postingHigh]]),
                docCount: 100,
                avgDocLength: 50,
                docLengths: new Map([["doc1", 50]]),
            });

            const scoreLow = computeBm25Score("doc1", ["term"], indexLow, 1.5, 0.75);
            const scoreHigh = computeBm25Score("doc1", ["term"], indexHigh, 1.5, 0.75);
            expect(scoreHigh).toBeGreaterThan(scoreLow);
        });

        it("rarer terms produce higher IDF", () => {
            // Term in 1 doc vs term in 50 docs (out of 100)
            const postingRare = new Map([["doc1", { tf: 1 }]]);
            const postingCommon = new Map([["doc1", { tf: 1 }]]);
            // Simulate df by adding more doc IDs to the posting set
            for (let i = 2; i <= 50; i++) {
                postingCommon.set(`doc${i}`, { tf: 1 });
            }

            const indexRare = makeIndex({
                postings: new Map([["rare", postingRare]]),
                docCount: 100,
                avgDocLength: 50,
                docLengths: new Map([["doc1", 50]]),
            });
            const indexCommon = makeIndex({
                postings: new Map([["common", postingCommon]]),
                docCount: 100,
                avgDocLength: 50,
                docLengths: new Map([["doc1", 50]]),
            });

            const scoreRare = computeBm25Score("doc1", ["rare"], indexRare, 1.5, 0.75);
            const scoreCommon = computeBm25Score("doc1", ["common"], indexCommon, 1.5, 0.75);
            expect(scoreRare).toBeGreaterThan(scoreCommon);
        });

        it("shorter documents get higher TF normalization", () => {
            const posting = new Map([["doc1", { tf: 3 }]]);

            const indexShort = makeIndex({
                postings: new Map([["term", posting]]),
                docCount: 100,
                avgDocLength: 100,
                docLengths: new Map([["doc1", 30]]),
            });
            const indexLong = makeIndex({
                postings: new Map([["term", posting]]),
                docCount: 100,
                avgDocLength: 100,
                docLengths: new Map([["doc1", 300]]),
            });

            const scoreShort = computeBm25Score("doc1", ["term"], indexShort, 1.5, 0.75);
            const scoreLong = computeBm25Score("doc1", ["term"], indexLong, 1.5, 0.75);
            expect(scoreShort).toBeGreaterThan(scoreLong);
        });

        it("handles multiple query tokens and sums scores", () => {
            const postingA = new Map([["doc1", { tf: 2 }]]);
            const postingB = new Map([["doc1", { tf: 1 }]]);
            const index = makeIndex({
                postings: new Map([
                    ["alpha", postingA],
                    ["beta", postingB],
                ]),
                docCount: 100,
                avgDocLength: 50,
                docLengths: new Map([["doc1", 50]]),
            });

            const scoreMulti = computeBm25Score("doc1", ["alpha", "beta"], index, 1.5, 0.75);
            const scoreSingle = computeBm25Score("doc1", ["alpha"], index, 1.5, 0.75);
            expect(scoreMulti).toBeGreaterThan(scoreSingle);
        });

        it("handles missing docLengths gracefully", () => {
            const posting = new Map([["doc1", { tf: 2 }]]);
            const index = makeIndex({
                postings: new Map([["term", posting]]),
                docCount: 10,
                avgDocLength: 50,
                docLengths: new Map(), // doc1 not in docLengths
            });

            const score = computeBm25Score("doc1", ["term"], index, 1.5, 0.75);
            // dl defaults to 0, so TF norm should still compute
            expect(score).toBeGreaterThan(0);
        });

        it("k1 and b parameters affect scoring", () => {
            const posting = new Map([["doc1", { tf: 5 }]]);
            const index = makeIndex({
                postings: new Map([["term", posting]]),
                docCount: 100,
                avgDocLength: 50,
                docLengths: new Map([["doc1", 100]]),
            });

            const scoreDefault = computeBm25Score("doc1", ["term"], index, 1.5, 0.75);
            const scoreHighK1 = computeBm25Score("doc1", ["term"], index, 3.0, 0.75);
            // Higher k1 increases TF saturation point
            expect(scoreHighK1).not.toBe(scoreDefault);
        });
    });
});
