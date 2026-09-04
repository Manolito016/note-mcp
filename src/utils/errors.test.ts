/**
 * Unit tests for the structured error system and input validation.
 */
import { describe, it, expect } from "vitest";
import {
    ErrorCode,
    QuillError,
    classifyError,
    validateContentSize,
    validateBatchSize,
    MAX_CONTENT_BYTES,
    MAX_BATCH_SIZE,
} from "./errors.js";

describe("QuillError", () => {
    it("creates error with code and category", () => {
        const err = new QuillError(ErrorCode.PATH_TRAVERSAL, "traversal blocked");
        expect(err.code).toBe("PATH_TRAVERSAL");
        expect(err.category).toBe("path");
        expect(err.message).toBe("traversal blocked");
        expect(err).toBeInstanceOf(Error);
    });

    it("includes details when provided", () => {
        const err = new QuillError(ErrorCode.INPUT_TOO_LARGE, "too big", { limit: 100, actual: 200 });
        expect(err.details).toEqual({ limit: 100, actual: 200 });
    });

    it("toMcpData returns structured object", () => {
        const err = new QuillError(ErrorCode.MEMORY_NOT_FOUND, "not found", { id: "mem_123" });
        const data = err.toMcpData();
        expect(data.code).toBe("MEMORY_NOT_FOUND");
        expect(data.category).toBe("memory");
        expect(data.message).toBe("not found");
        expect(data.details).toEqual({ id: "mem_123" });
    });

    it("toMcpData omits details when not provided", () => {
        const err = new QuillError(ErrorCode.INTERNAL_ERROR, "oops");
        const data = err.toMcpData();
        expect(data.details).toBeUndefined();
    });
});

describe("classifyError", () => {
    it("passes through QuillError unchanged", () => {
        const original = new QuillError(ErrorCode.PATH_PROTECTED, "protected dir");
        const result = classifyError(original);
        expect(result.code).toBe("PATH_PROTECTED");
        expect(result.message).toBe("protected dir");
    });

    it("classifies traversal errors from message", () => {
        const result = classifyError(new Error("Path traversal blocked: ../../etc"));
        expect(result.code).toBe("PATH_TRAVERSAL");
    });

    it("classifies symlink errors from message", () => {
        const result = classifyError(new Error("symlink escape detected"));
        expect(result.code).toBe("SYMLINK_ESCAPE");
    });

    it("classifies protected dir errors from message", () => {
        const result = classifyError(new Error("Operation blocked: .git is a protected internal directory"));
        expect(result.code).toBe("PATH_PROTECTED");
    });

    it("classifies not-found errors from message", () => {
        const result = classifyError(new Error("File not found at path"));
        expect(result.code).toBe("PATH_NOT_FOUND");
    });

    it("classifies already-exists errors from message", () => {
        const result = classifyError(new Error("Note already exists"));
        expect(result.code).toBe("PATH_EXISTS");
    });

    it("falls back to INTERNAL_ERROR for unknown errors", () => {
        const result = classifyError(new Error("something weird happened"));
        expect(result.code).toBe("INTERNAL_ERROR");
    });

    it("handles non-Error values", () => {
        const result = classifyError("string error");
        expect(result.code).toBe("INTERNAL_ERROR");
        expect(result.message).toBe("string error");
    });
});

describe("validateContentSize", () => {
    it("returns null for content within limit", () => {
        expect(validateContentSize("hello world")).toBeNull();
    });

    it("returns error for content exceeding limit", () => {
        const big = "x".repeat(MAX_CONTENT_BYTES + 1);
        const result = validateContentSize(big);
        expect(result).toBeInstanceOf(QuillError);
        expect(result!.code).toBe("INPUT_TOO_LARGE");
    });

    it("respects custom limit", () => {
        const result = validateContentSize("hello", 3);
        expect(result).toBeInstanceOf(QuillError);
    });

    it("allows content exactly at limit", () => {
        const exact = "x".repeat(100);
        expect(validateContentSize(exact, 100)).toBeNull();
    });
});

describe("validateBatchSize", () => {
    it("returns null for batches within limit", () => {
        expect(validateBatchSize([1, 2, 3])).toBeNull();
    });

    it("returns error for batches exceeding limit", () => {
        const big = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => i);
        const result = validateBatchSize(big);
        expect(result).toBeInstanceOf(QuillError);
        expect(result!.code).toBe("INPUT_TOO_LARGE");
    });

    it("allows empty batches", () => {
        expect(validateBatchSize([])).toBeNull();
    });
});
