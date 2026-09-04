import { describe, it, expect } from "vitest";
import { validateTransition, getAvailableTransitions, isActiveStatus } from "./lifecycle.js";

describe("Memory Lifecycle", () => {
    describe("validateTransition", () => {
        it("should allow ACTIVE → CONFIRMED", () => {
            const result = validateTransition("ACTIVE", "CONFIRMED");
            expect(result.success).toBe(true);
        });

        it("should allow ACTIVE → ARCHIVED", () => {
            const result = validateTransition("ACTIVE", "ARCHIVED");
            expect(result.success).toBe(true);
        });

        it("should allow ACTIVE → DEPRECATED", () => {
            const result = validateTransition("ACTIVE", "DEPRECATED");
            expect(result.success).toBe(true);
        });

        it("should allow ACTIVE → SUPERSEDED", () => {
            const result = validateTransition("ACTIVE", "SUPERSEDED");
            expect(result.success).toBe(true);
        });

        it("should allow ACTIVE → CONFLICTED", () => {
            const result = validateTransition("ACTIVE", "CONFLICTED");
            expect(result.success).toBe(true);
        });

        it("should reject ACTIVE → REJECTED (not a direct transition)", () => {
            const result = validateTransition("ACTIVE", "REJECTED");
            expect(result.success).toBe(false);
        });

        it("should reject CONFIRMED → ACTIVE (no backward)", () => {
            const result = validateTransition("CONFIRMED", "ACTIVE");
            expect(result.success).toBe(false);
        });

        it("should reject ARCHIVED → ACTIVE without evidence", () => {
            const result = validateTransition("ARCHIVED", "ACTIVE");
            expect(result.success).toBe(false);
        });

        it("should allow ARCHIVED → ACTIVE with evidence", () => {
            const result = validateTransition("ARCHIVED", "ACTIVE", "Resurrected due to new evidence");
            expect(result.success).toBe(true);
        });

        it("should reject SUPERSEDED → anything (terminal)", () => {
            expect(validateTransition("SUPERSEDED", "ACTIVE").success).toBe(false);
            expect(validateTransition("SUPERSEDED", "ARCHIVED").success).toBe(false);
            expect(validateTransition("SUPERSEDED", "CONFIRMED").success).toBe(false);
        });

        it("should allow same-status transition (no-op)", () => {
            const result = validateTransition("ACTIVE", "ACTIVE");
            expect(result.success).toBe(true);
        });

        it("should reject REJECTED → ACTIVE", () => {
            const result = validateTransition("REJECTED", "ACTIVE");
            expect(result.success).toBe(false);
        });

        it("should allow CONFLICTED → ACTIVE (resolution)", () => {
            const result = validateTransition("CONFLICTED", "ACTIVE");
            expect(result.success).toBe(true);
        });

        it("should reject CONFLICTED → CONFIRMED (not a direct transition)", () => {
            const result = validateTransition("CONFLICTED", "CONFIRMED");
            expect(result.success).toBe(false);
        });
    });

    describe("getAvailableTransitions", () => {
        it("should return all forward transitions for ACTIVE", () => {
            const transitions = getAvailableTransitions("ACTIVE");
            expect(transitions).toContain("CONFIRMED");
            expect(transitions).toContain("ARCHIVED");
            expect(transitions).toContain("DEPRECATED");
            expect(transitions).toContain("SUPERSEDED");
            expect(transitions).toContain("CONFLICTED");
            expect(transitions).toContain("ARCHIVED");
            expect(transitions).not.toContain("REJECTED");
        });

        it("should return empty for SUPERSEDED (terminal)", () => {
            const transitions = getAvailableTransitions("SUPERSEDED");
            expect(transitions).toHaveLength(0);
        });

        it("should not include backward transitions for CONFIRMED", () => {
            const transitions = getAvailableTransitions("CONFIRMED");
            expect(transitions).not.toContain("ACTIVE");
        });
    });

    describe("isActiveStatus", () => {
        it("should return true for ACTIVE", () => {
            expect(isActiveStatus("ACTIVE")).toBe(true);
        });

        it("should return true for CONFIRMED", () => {
            expect(isActiveStatus("CONFIRMED")).toBe(true);
        });

        it("should return false for ARCHIVED", () => {
            expect(isActiveStatus("ARCHIVED")).toBe(false);
        });

        it("should return false for SUPERSEDED", () => {
            expect(isActiveStatus("SUPERSEDED")).toBe(false);
        });

        it("should return false for REJECTED", () => {
            expect(isActiveStatus("REJECTED")).toBe(false);
        });
    });
});
