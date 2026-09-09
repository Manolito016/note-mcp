/**
 * Unit tests for pagination utilities.
 * Tests cursor encoding/decoding, bounded limits, and edge cases.
 */
import { describe, it, expect } from "vitest";
import { boundedLimit, decodeCursor, encodeCursor, MAX_DISCOVERY_LIMIT } from "./pagination.js";

describe("Pagination", () => {
    describe("boundedLimit", () => {
        it("returns fallback when limit is undefined", () => {
            expect(boundedLimit(undefined, 20)).toBe(20);
        });

        it("returns the limit when within bounds", () => {
            expect(boundedLimit(50, 20)).toBe(50);
        });

        it("caps at MAX_DISCOVERY_LIMIT", () => {
            expect(boundedLimit(1000, 20)).toBe(MAX_DISCOVERY_LIMIT);
        });

        it("enforces minimum of 1", () => {
            expect(boundedLimit(0, 20)).toBe(1);
            expect(boundedLimit(-5, 20)).toBe(1);
        });

        it("floors decimal values", () => {
            expect(boundedLimit(15.7, 20)).toBe(15);
            expect(boundedLimit(15.2, 20)).toBe(15);
        });

        it("handles MAX_DISCOVERY_LIMIT exactly", () => {
            expect(boundedLimit(MAX_DISCOVERY_LIMIT, 20)).toBe(MAX_DISCOVERY_LIMIT);
        });

        it("handles limit of 1", () => {
            expect(boundedLimit(1, 20)).toBe(1);
        });
    });

    describe("encodeCursor / decodeCursor", () => {
        it("roundtrips offset 0", () => {
            const cursor = encodeCursor(0);
            expect(decodeCursor(cursor)).toBe(0);
        });

        it("roundtrips positive offsets", () => {
            for (const offset of [1, 10, 100, 999, 10000]) {
                const cursor = encodeCursor(offset);
                expect(decodeCursor(cursor)).toBe(offset);
            }
        });

        it("returns 0 for undefined cursor", () => {
            expect(decodeCursor(undefined)).toBe(0);
        });

        it("returns 0 for empty string cursor", () => {
            expect(decodeCursor("")).toBe(0);
        });

        it("throws on invalid cursor string", () => {
            expect(() => decodeCursor("not-valid-base64url!!!")).toThrow("Invalid pagination cursor");
        });

        it("throws on cursor encoding negative number", () => {
            const cursor = Buffer.from("-1", "utf-8").toString("base64url");
            expect(() => decodeCursor(cursor)).toThrow("Invalid pagination cursor");
        });

        it("parses cursor encoding non-integer as floor", () => {
            // Number.parseInt("3.14", 10) returns 3, which is valid
            const cursor = Buffer.from("3.14", "utf-8").toString("base64url");
            expect(decodeCursor(cursor)).toBe(3);
        });

        it("throws on cursor encoding non-numeric string", () => {
            const cursor = Buffer.from("abc", "utf-8").toString("base64url");
            expect(() => decodeCursor(cursor)).toThrow("Invalid pagination cursor");
        });

        it("produces URL-safe base64 strings", () => {
            const cursor = encodeCursor(12345);
            // base64url should not contain +, /, or =
            expect(cursor).not.toMatch(/[+/=]/);
        });

        it("handles large offsets", () => {
            const largeOffset = Number.MAX_SAFE_INTEGER - 1;
            const cursor = encodeCursor(largeOffset);
            expect(decodeCursor(cursor)).toBe(largeOffset);
        });
    });
});
