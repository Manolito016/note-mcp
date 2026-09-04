import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initVault } from "./vault.js";
import { searchIndex } from "./search-index.js";

const TEST_VAULT = join(process.cwd(), "test-vault-search-temp");

describe("SearchIndex", () => {
    beforeAll(async () => {
        // Create a temp vault with sample markdown files
        await mkdir(join(TEST_VAULT, "notes"), { recursive: true });
        await mkdir(join(TEST_VAULT, "templates"), { recursive: true });

        await writeFile(
            join(TEST_VAULT, "notes", "meeting-notes.md"),
            [
                "---",
                "title: Weekly Meeting Notes",
                "tags: [meetings, weekly]",
                "category: notes",
                "---",
                "",
                "# Weekly Meeting",
                "",
                "Discussed project timeline and deliverables.",
                "Action items assigned to the development team.",
            ].join("\n"),
        );

        await writeFile(
            join(TEST_VAULT, "notes", "architecture.md"),
            [
                "---",
                "title: System Architecture",
                "tags: [architecture, design, technical]",
                "category: reference",
                "---",
                "",
                "# Architecture Overview",
                "",
                "The system uses a microservices architecture.",
                "Each service communicates via REST APIs.",
            ].join("\n"),
        );

        await writeFile(
            join(TEST_VAULT, "templates", "PRD_TEMPLATE.md"),
            [
                "---",
                "title: PRD Template - Product Requirements",
                "tags: [prd, template, product-requirements]",
                "category: template",
                "phase: define",
                "---",
                "",
                "# Product Requirements Document",
                "",
                "## Executive Summary",
                "Describe the product vision and goals.",
            ].join("\n"),
        );

        // Initialise vault with the temp directory
        process.argv = ["node", "index.js", TEST_VAULT];
        initVault();
        searchIndex.markDirty();
        await searchIndex.ensureSynchronized();
    });

    afterAll(async () => {
        await rm(TEST_VAULT, { recursive: true, force: true });
    });

    it("indexes documents from the vault", () => {
        const docs = searchIndex.getDocuments();
        expect(docs.length).toBe(3);
    });

    it("each document has required fields", () => {
        const docs = searchIndex.getDocuments();
        const doc = docs.find((d) => d.filename === "meeting-notes.md");
        expect(doc).toBeDefined();
        expect(doc!.path).toBe("notes/meeting-notes.md");
        expect(doc!.lines.length).toBeGreaterThan(0);
        expect(doc!.tokenCount).toBeGreaterThan(0);
        expect(doc!.termFreq).toBeInstanceOf(Map);
    });

    it("extracts frontmatter tags", () => {
        const docs = searchIndex.getDocuments();
        const doc = docs.find((d) => d.filename === "meeting-notes.md");
        expect(doc).toBeDefined();
        expect(doc!.tags).toContain("meetings");
        expect(doc!.tags).toContain("weekly");
    });

    it("extracts frontmatter title", () => {
        const docs = searchIndex.getDocuments();
        const doc = docs.find((d) => d.filename === "architecture.md");
        expect(doc).toBeDefined();
        expect(doc!.title).toBe("System Architecture");
    });

    it("builds an inverted index with all terms", () => {
        const terms = searchIndex.getAllTerms();
        expect(terms.length).toBeGreaterThan(0);
        // Terms should be lowercase
        expect(terms.every((t) => t === t.toLowerCase())).toBe(true);
        // Should contain known terms from our test files
        expect(terms).toContain("meeting");
        expect(terms).toContain("architecture");
    });

    it("BM25 score is 0 for non-matching tokens", () => {
        const docs = searchIndex.getDocuments();
        const doc = docs.find((d) => d.filename === "meeting-notes.md")!;
        const score = searchIndex.bm25Score(doc, ["zzzznonexistent"]);
        expect(score).toBe(0);
    });

    it("BM25 score is positive for matching tokens", () => {
        const docs = searchIndex.getDocuments();
        const doc = docs.find((d) => d.filename === "meeting-notes.md")!;
        const score = searchIndex.bm25Score(doc, ["meeting"]);
        expect(score).toBeGreaterThan(0);
    });

    it("BM25 ranks documents with more relevant content higher", () => {
        const docs = searchIndex.getDocuments();
        const meeting = docs.find((d) => d.filename === "meeting-notes.md")!;
        const arch = docs.find((d) => d.filename === "architecture.md")!;
        const scoreMeeting = searchIndex.bm25Score(meeting, ["meeting"]);
        const scoreArch = searchIndex.bm25Score(arch, ["meeting"]);
        expect(scoreMeeting).toBeGreaterThan(scoreArch);
    });

    it("suggestCorrection returns a close term for typos", () => {
        // "meting" should suggest "meeting" (1 edit, tolerance for 6-char word = 1)
        const suggestion = searchIndex.suggestCorrection("meting");
        expect(suggestion).toBe("meeting");
    });

    it("suggestCorrection returns undefined for gibberish", () => {
        const suggestion = searchIndex.suggestCorrection("xyzxyzxyzxyzxyz");
        expect(suggestion).toBeUndefined();
    });

    it("markDirty forces re-index on next ensureSynchronized", async () => {
        searchIndex.markDirty();
        await searchIndex.ensureSynchronized();
        const docs = searchIndex.getDocuments();
        expect(docs.length).toBe(3);
    });
});
