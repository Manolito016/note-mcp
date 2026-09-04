import { describe, it, expect } from "vitest";
import { generateMemoryId, isValidMemoryId, extractTimestamp } from "./memory-id.js";

describe("Memory ID Generation", () => {
    it("should generate IDs with mem_ prefix", () => {
        const id = generateMemoryId();
        expect(id).toMatch(/^mem_/);
    });

    it("should generate 26-char ULID after prefix", () => {
        const id = generateMemoryId();
        const ulid = id.slice(4);
        expect(ulid).toHaveLength(26);
        expect(ulid).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    });

    it("should generate unique IDs", () => {
        const ids = new Set(Array.from({ length: 1000 }, () => generateMemoryId()));
        expect(ids.size).toBe(1000);
    });

    it("should validate correct IDs", () => {
        const id = generateMemoryId();
        expect(isValidMemoryId(id)).toBe(true);
    });

    it("should reject invalid IDs", () => {
        expect(isValidMemoryId("")).toBe(false);
        expect(isValidMemoryId("mem_")).toBe(false);
        expect(isValidMemoryId("not_a_valid_id")).toBe(false);
        expect(isValidMemoryId("mem_INVALID_CHARS")).toBe(false);
        expect(isValidMemoryId("prefix_01ARZMY7X51XK2JW9YPB5CVDGM")).toBe(false);
    });

    it("should extract timestamp from ID", () => {
        const before = Date.now();
        const id = generateMemoryId();
        const after = Date.now();
        const ts = extractTimestamp(id).getTime();
        expect(ts).toBeGreaterThanOrEqual(before);
        expect(ts).toBeLessThanOrEqual(after);
    });

    it("should generate monotonically increasing IDs", () => {
        const ids = Array.from({ length: 100 }, () => generateMemoryId());
        for (let i = 1; i < ids.length; i++) {
            expect(ids[i] > ids[i - 1]).toBe(true);
        }
    });
});
