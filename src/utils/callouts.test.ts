/**
 * Unit tests for Obsidian callout parsing.
 * Tests extraction, type resolution, formatting, and edge cases.
 */
import { describe, it, expect } from "vitest";
import {
    extractCallouts,
    resolveCalloutType,
    formatCallout,
    CALLOUT_TYPES,
} from "./callouts.js";

describe("Callouts", () => {
    describe("resolveCalloutType", () => {
        it("returns canonical type for known types", () => {
            expect(resolveCalloutType("note")).toBe("note");
            expect(resolveCalloutType("warning")).toBe("warning");
            expect(resolveCalloutType("info")).toBe("info");
        });

        it("resolves aliases to canonical type", () => {
            expect(resolveCalloutType("summary")).toBe("abstract");
            expect(resolveCalloutType("tldr")).toBe("abstract");
            expect(resolveCalloutType("hint")).toBe("tip");
            expect(resolveCalloutType("important")).toBe("tip");
            expect(resolveCalloutType("check")).toBe("success");
            expect(resolveCalloutType("done")).toBe("success");
            expect(resolveCalloutType("help")).toBe("question");
            expect(resolveCalloutType("faq")).toBe("question");
            expect(resolveCalloutType("caution")).toBe("warning");
            expect(resolveCalloutType("attention")).toBe("warning");
            expect(resolveCalloutType("fail")).toBe("failure");
            expect(resolveCalloutType("missing")).toBe("failure");
            expect(resolveCalloutType("error")).toBe("danger");
            expect(resolveCalloutType("cite")).toBe("quote");
        });

        it("is case-insensitive", () => {
            expect(resolveCalloutType("NOTE")).toBe("note");
            expect(resolveCalloutType("Warning")).toBe("warning");
            expect(resolveCalloutType("HINT")).toBe("tip");
        });

        it("returns lowercase for unknown types", () => {
            expect(resolveCalloutType("custom")).toBe("custom");
            expect(resolveCalloutType("MyType")).toBe("mytype");
        });
    });

    describe("extractCallouts", () => {
        it("extracts a simple callout", () => {
            const content = `> [!note] My Title
> This is the content
> Second line`;

            const callouts = extractCallouts(content);
            expect(callouts).toHaveLength(1);
            expect(callouts[0].type).toBe("note");
            expect(callouts[0].title).toBe("My Title");
            expect(callouts[0].content).toBe("This is the content\nSecond line");
            expect(callouts[0].line).toBe(1);
        });

        it("extracts callout without title", () => {
            const content = `> [!warning]
> Be careful`;

            const callouts = extractCallouts(content);
            expect(callouts).toHaveLength(1);
            expect(callouts[0].title).toBe("");
            expect(callouts[0].content).toBe("Be careful");
        });

        it("detects foldable callouts with +", () => {
            const content = `> [!tip]+ Expanded
> Content here`;

            const callouts = extractCallouts(content);
            expect(callouts).toHaveLength(1);
            expect(callouts[0].foldable).toBe(true);
            expect(callouts[0].collapsed).toBe(false);
        });

        it("detects collapsed callouts with -", () => {
            const content = `> [!info]- Collapsed
> Hidden content`;

            const callouts = extractCallouts(content);
            expect(callouts).toHaveLength(1);
            expect(callouts[0].foldable).toBe(true);
            expect(callouts[0].collapsed).toBe(true);
        });

        it("non-foldable callout has foldable=false", () => {
            const content = `> [!note] Regular
> Content`;

            const callouts = extractCallouts(content);
            expect(callouts[0].foldable).toBe(false);
            expect(callouts[0].collapsed).toBe(false);
        });

        it("extracts multiple callouts", () => {
            const content = `Some text

> [!note] First
> Content 1

> [!warning] Second
> Content 2`;

            const callouts = extractCallouts(content);
            expect(callouts).toHaveLength(2);
            expect(callouts[0].type).toBe("note");
            expect(callouts[1].type).toBe("warning");
        });

        it("resolves callout type aliases", () => {
            const content = `> [!hint] Use this
> A helpful tip`;

            const callouts = extractCallouts(content);
            expect(callouts[0].type).toBe("tip"); // "hint" resolves to "tip"
        });

        it("returns empty array for content without callouts", () => {
            const content = `# Heading
Just regular text.
No callouts here.`;

            expect(extractCallouts(content)).toEqual([]);
        });

        it("handles empty content", () => {
            expect(extractCallouts("")).toEqual([]);
        });

        it("handles callout with empty content", () => {
            const content = `> [!note] Title only`;

            const callouts = extractCallouts(content);
            expect(callouts).toHaveLength(1);
            expect(callouts[0].content).toBe("");
        });

        it("reports correct line numbers", () => {
            const content = `Line 1
Line 2
Line 3
> [!note] Found it
> Content`;

            const callouts = extractCallouts(content);
            expect(callouts[0].line).toBe(4);
        });
    });

    describe("formatCallout", () => {
        it("formats header-only callout", () => {
            const result = formatCallout("note", "My Title");
            expect(result).toBe("> [!note] My Title");
        });

        it("formats callout without title", () => {
            const result = formatCallout("warning");
            expect(result).toBe("> [!warning]");
        });

        it("formats foldable expanded callout", () => {
            const result = formatCallout("tip", "Help", "Content", true, false);
            expect(result).toContain("> [!tip]+ Help");
            expect(result).toContain("> Content");
        });

        it("formats foldable collapsed callout", () => {
            const result = formatCallout("info", "Details", "Hidden", true, true);
            expect(result).toContain("> [!info]- Details");
            expect(result).toContain("> Hidden");
        });

        it("formats callout with multi-line content", () => {
            const result = formatCallout("note", "Title", "Line 1\nLine 2\nLine 3");
            const lines = result.split("\n");
            expect(lines[0]).toBe("> [!note] Title");
            expect(lines[1]).toBe("> Line 1");
            expect(lines[2]).toBe("> Line 2");
            expect(lines[3]).toBe("> Line 3");
        });

        it("roundtrips through extractCallouts", () => {
            const original = formatCallout("warning", "Careful", "Be careful here");
            const parsed = extractCallouts(original);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].type).toBe("warning");
            expect(parsed[0].title).toBe("Careful");
            expect(parsed[0].content).toBe("Be careful here");
        });
    });

    describe("CALLOUT_TYPES", () => {
        it("has all standard Obsidian callout types", () => {
            const expected = ["note", "abstract", "info", "todo", "tip", "success", "question", "warning", "failure", "danger", "bug", "example", "quote"];
            for (const type of expected) {
                expect(CALLOUT_TYPES[type]).toBeDefined();
                expect(CALLOUT_TYPES[type].color).toBeDefined();
            }
        });

        it("each type has a color", () => {
            for (const [, info] of Object.entries(CALLOUT_TYPES)) {
                expect(info.color).toBeTruthy();
                expect(typeof info.color).toBe("string");
            }
        });

        it("each type has an aliases array", () => {
            for (const [, info] of Object.entries(CALLOUT_TYPES)) {
                expect(Array.isArray(info.aliases)).toBe(true);
            }
        });
    });
});
