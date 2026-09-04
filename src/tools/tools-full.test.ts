import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { initVault } from "../utils/vault.js";
import { handler as deleteNoteHandler } from "./delete-note.js";
import { handler as restoreNoteHandler } from "./restore-note.js";
import { handler as listTrashHandler } from "./list-trash.js";
import { handler as readNoteHandler } from "./read-note.js";
import { handler as writeNoteHandler } from "./write-note.js";
import { handler as createNoteHandler } from "./create-note.js";
import { handler as appendNoteHandler } from "./append-note.js";
import { handler as moveNoteHandler } from "./move-note.js";
import { handler as copyNoteHandler } from "./copy-note.js";
import { handler as listNotesHandler } from "./list-notes.js";
import { handler as searchNotesHandler } from "./search-notes.js";
import { handler as extractLinksHandler } from "./extract-links.js";
import { handler as findBacklinksHandler } from "./find-backlinks.js";
import { handler as vaultStatusHandler } from "./vault-status.js";
import { handler as batchDeleteHandler } from "./batch-delete.js";
import { handler as batchMoveHandler } from "./batch-move.js";

const TEST_VAULT = join(process.cwd(), "test-vault-temp-tools-full");

describe("Core Tool Tests", () => {
    beforeEach(async () => {
        // Clean up any stale directory first (Windows file lock resilience)
        try {
            await rm(TEST_VAULT, { recursive: true, force: true });
        } catch {
            // Ignore cleanup failures from previous runs
        }
        await mkdir(TEST_VAULT, { recursive: true });
        await mkdir(join(TEST_VAULT, "notes"), { recursive: true });
        await writeFile(join(TEST_VAULT, "notes", "test.md"), "# Test\n\nHello world\n\n#tag1 #tag2");
        await writeFile(
            join(TEST_VAULT, "notes", "linked.md"),
            "# Linked\n\nSee [[test]] and [link](notes/test.md)\n\n#tag1 #tag3",
        );
        // Additional test fixtures for new parameter tests
        await writeFile(
            join(TEST_VAULT, "notes", "frontmatter-note.md"),
            "---\ntitle: Test Note\ndate: 2024-01-01\ntags:\n  - test\n  - demo\n---\n\nBody content here",
        );
        await writeFile(
            join(TEST_VAULT, "notes", "template.md"),
            "---\ntitle: Template\n---\n\n# {{title}}\n\nDate: {{date}}\n\nPath: {{path}}\n\nTags: {{tags}}",
        );
        await writeFile(join(TEST_VAULT, "notes", "extra.md"), "Extra note for sorting tests\n\n#tag2");
        await writeFile(join(TEST_VAULT, "notes", "empty.md"), "");
        await writeFile(join(TEST_VAULT, "notes", "orphan.md"), "I am never linked to by any other note\n\n#orphan");
        // Use environment variable for reliable vault path resolution in tests
        process.env.NOTES_VAULT_PATH = TEST_VAULT;
        delete process.argv[2];
        initVault();
    });

    afterEach(async () => {
        delete process.env.NOTES_VAULT_PATH;
        // Windows file locks can cause rm to hang — use a timeout
        try {
            await Promise.race([
                rm(TEST_VAULT, { recursive: true, force: true }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("cleanup timeout")), 5000)),
            ]);
        } catch {
            // Best effort — stale directories are cleaned up by the next beforeEach
        }
    }, 10000);

    describe("read_note", () => {
        it("should read an existing note", async () => {
            const result = await readNoteHandler({ path: "notes/test.md", frontmatter_only: false, summary: false });
            expect(result.content[0].text).toContain("Hello world");
        });

        it("should error for non-existing note", async () => {
            const result = await readNoteHandler({
                path: "notes/nonexistent.md",
                frontmatter_only: false,
                summary: false,
            });
            expect(result.isError).toBe(true);
        });

        it("should read specific line range", async () => {
            const result = await readNoteHandler({
                path: "notes/test.md",
                start_line: 1,
                end_line: 3,
                frontmatter_only: false,
                summary: false,
            });
            expect(result.content[0].text).toContain("Lines 1");
            expect(result.content[0].text).toContain("# Test");
            expect(result.content[0].text).toContain("Hello world");
        });

        it("should return frontmatter only", async () => {
            const result = await readNoteHandler({
                path: "notes/frontmatter-note.md",
                frontmatter_only: true,
                summary: false,
            });
            expect(result.content[0].text).toContain("title");
            expect(result.content[0].text).toContain("Test Note");
            expect(result.content[0].text).not.toContain("Body content");
        });

        it("should report no frontmatter when absent", async () => {
            const result = await readNoteHandler({ path: "notes/test.md", frontmatter_only: true, summary: false });
            expect(result.content[0].text).toContain("No frontmatter");
        });

        it("should return summary with headings", async () => {
            const result = await readNoteHandler({ path: "notes/test.md", frontmatter_only: false, summary: true });
            expect(result.content[0].text).toContain("Summary");
            expect(result.content[0].text).toContain("# Test");
        });

        it("should truncate to token budget", async () => {
            const result = await readNoteHandler({
                path: "notes/test.md",
                frontmatter_only: false,
                summary: false,
                max_tokens: 2,
            });
            expect(result.content[0].text).toContain("truncated");
        });
    });

    describe("write_note", () => {
        it("should create a new note", async () => {
            const result = await writeNoteHandler({
                path: "notes/new.md",
                content: "New content",
                create_if_missing: true,
            });
            expect(result.content[0].text).toContain("notes/new.md");
            const read = await readFile(join(TEST_VAULT, "notes", "new.md"), "utf-8");
            expect(read).toBe("New content");
        });

        it("should overwrite existing note", async () => {
            await writeNoteHandler({ path: "notes/test.md", content: "Overwritten", create_if_missing: true });
            const read = await readFile(join(TEST_VAULT, "notes", "test.md"), "utf-8");
            expect(read).toBe("Overwritten");
        });
    });

    describe("create_note", () => {
        it("should create a new note", async () => {
            const result = await createNoteHandler({
                path: "notes/fresh.md",
                content: "Fresh note",
                auto_frontmatter: false,
                dry_run: false,
            });
            expect(result.content[0].text).toContain("created");
        });

        it("should fail if note already exists", async () => {
            const result = await createNoteHandler({
                path: "notes/test.md",
                content: "Duplicate",
                auto_frontmatter: false,
                dry_run: false,
            });
            expect(result.isError).toBe(true);
        });

        it("should auto-generate frontmatter", async () => {
            const result = await createNoteHandler({
                path: "notes/auto-fm.md",
                content: "Some body text",
                auto_frontmatter: true,
                tags: ["alpha", "beta"],
                dry_run: false,
            });
            expect(result.content[0].text).toContain("created");
            const written = await readFile(join(TEST_VAULT, "notes", "auto-fm.md"), "utf-8");
            expect(written).toContain("title:");
            expect(written).toContain("date:");
            expect(written).toContain("alpha");
        });

        it("should interpolate template variables", async () => {
            const result = await createNoteHandler({
                path: "notes/from-template.md",
                content: "",
                template: "notes/template.md",
                auto_frontmatter: false,
                tags: ["test", "demo"],
                dry_run: false,
            });
            expect(result.content[0].text).toContain("created");
            const written = await readFile(join(TEST_VAULT, "notes", "from-template.md"), "utf-8");
            expect(written).toContain("from template"); // {{title}} → "from template"
            expect(written).toContain("#test #demo"); // {{tags}} → "#test #demo"
        });

        it("should error on missing template", async () => {
            const result = await createNoteHandler({
                path: "notes/no-tpl.md",
                content: "",
                template: "notes/nonexistent-template.md",
                auto_frontmatter: false,
                dry_run: false,
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("Template not found");
        });

        it("should preview with dry_run without writing", async () => {
            const result = await createNoteHandler({
                path: "notes/dry-run-note.md",
                content: "Preview content",
                auto_frontmatter: false,
                dry_run: true,
            });
            expect(result.content[0].text).toContain("DRY RUN");
            expect(result.isError).toBeFalsy();
            const exists = await readFile(join(TEST_VAULT, "notes", "dry-run-note.md"), "utf-8").catch(() => null);
            expect(exists).toBeNull();
        });
    });

    describe("append_note", () => {
        it("should append content to existing note", async () => {
            await appendNoteHandler({
                path: "notes/test.md",
                content: "\nAppended text",
                prepend: false,
                auto_newline: true,
            });
            const read = await readFile(join(TEST_VAULT, "notes", "test.md"), "utf-8");
            expect(read).toContain("Appended text");
        });
    });

    describe("soft delete and restore", () => {
        it("should move note to trash by default", async () => {
            const result = await deleteNoteHandler({ path: "notes/test.md", permanent: false, dry_run: false });
            expect(result.content[0].text).toContain("trash");
        });

        it("should permanently delete when permanent=true", async () => {
            const result = await deleteNoteHandler({ path: "notes/test.md", permanent: true, dry_run: false });
            expect(result.content[0].text).toContain("permanently deleted");
        });

        it("should error when deleting non-existing note", async () => {
            const result = await deleteNoteHandler({ path: "notes/nope.md", permanent: false, dry_run: false });
            expect(result.isError).toBe(true);
        });

        it("should list items in trash", async () => {
            await deleteNoteHandler({ path: "notes/test.md", permanent: false, dry_run: false });
            const result = await listTrashHandler();
            expect(result.content[0].text).toContain("test.md");
        });

        it("should restore note from trash", async () => {
            await deleteNoteHandler({ path: "notes/test.md", permanent: false, dry_run: false });
            const result = await restoreNoteHandler({ path: "notes/test.md" });
            expect(result.content[0].text).toContain("Restored");
        });

        it("should delete files matching glob pattern", async () => {
            const result = await deleteNoteHandler({ path: "notes/*.md", permanent: false, dry_run: false });
            expect(result.content[0].text).toContain("moved to trash");
        });

        it("should preview glob deletion with dry_run", async () => {
            const result = await deleteNoteHandler({ path: "notes/*.md", permanent: false, dry_run: true });
            expect(result.content[0].text).toContain("DRY RUN");
            expect(result.content[0].text).toContain("Would delete");
            // Files should still exist after dry run
            const stillExists = await readFile(join(TEST_VAULT, "notes", "test.md"), "utf-8");
            expect(stillExists).toContain("Hello world");
        });

        it("should preview single file deletion with dry_run", async () => {
            const result = await deleteNoteHandler({ path: "notes/test.md", permanent: false, dry_run: true });
            expect(result.content[0].text).toContain("DRY RUN");
            expect(result.content[0].text).toContain("Would move to trash");
            // File should still exist
            const stillExists = await readFile(join(TEST_VAULT, "notes", "test.md"), "utf-8");
            expect(stillExists).toContain("Hello world");
        });
    });

    describe("move_note and copy_note", () => {
        it("should move a note", async () => {
            const result = await moveNoteHandler({ from: "notes/test.md", to: "notes/moved.md" });
            expect(result.content[0].text).toContain("moved");
        });

        it("should copy a note", async () => {
            const result = await copyNoteHandler({ from: "notes/test.md", to: "notes/copied.md" });
            expect(result.content[0].text).toContain("copied");
        });

        it("should block path traversal on move", async () => {
            await expect(moveNoteHandler({ from: "notes/test.md", to: "../../etc/passwd" })).rejects.toThrow(
                "Path traversal blocked",
            );
        });

        it("should block path traversal on copy", async () => {
            await expect(copyNoteHandler({ from: "notes/test.md", to: "../../etc/passwd" })).rejects.toThrow(
                "Path traversal blocked",
            );
        });
    });

    describe("list_notes extended", () => {
        it("should sort by name descending", async () => {
            const result = await listNotesHandler({
                path: "notes",
                recursive: false,
                offset: 0,
                sort: "name_desc",
                rich: false,
                tree: false,
            });
            const text = result.content[0].text;
            const extraIdx = text.indexOf("extra.md");
            const linkedIdx = text.indexOf("linked.md");
            expect(extraIdx).toBeGreaterThanOrEqual(0);
            expect(linkedIdx).toBeGreaterThanOrEqual(0);
            // Descending (z→a): linked > extra alphabetically, so linked appears first
            expect(linkedIdx).toBeLessThan(extraIdx);
        });

        it("should filter by extension", async () => {
            const result = await listNotesHandler({
                path: "notes",
                recursive: false,
                offset: 0,
                extension: ".md",
                sort: "name_asc",
                rich: false,
                tree: false,
            });
            expect(result.content[0].text).toContain("test.md");
        });

        it("should show rich output with size and date", async () => {
            const result = await listNotesHandler({
                path: "notes",
                recursive: false,
                offset: 0,
                sort: "name_asc",
                rich: true,
                tree: false,
            });
            const text = result.content[0].text;
            expect(text).toContain("📄");
            expect(text).toContain("test.md");
        });

        it("should show tree view with emojis", async () => {
            const result = await listNotesHandler({
                path: "notes",
                recursive: false,
                offset: 0,
                sort: "name_asc",
                rich: false,
                tree: true,
            });
            const text = result.content[0].text;
            expect(text).toContain("📄");
            expect(text).toContain("test.md");
        });
    });

    describe("list_notes", () => {
        it("should list files in directory", async () => {
            const result = await listNotesHandler({
                path: "notes",
                recursive: false,
                offset: 0,
                sort: "name_asc",
                rich: false,
                tree: false,
            });
            expect(result.content[0].text).toContain("test.md");
        });

        it("should exclude .trash from listing", async () => {
            await deleteNoteHandler({ path: "notes/test.md", permanent: false, dry_run: false });
            const result = await listNotesHandler({
                path: ".",
                recursive: true,
                offset: 0,
                sort: "name_asc",
                rich: false,
                tree: false,
            });
            expect(result.content[0].text).not.toContain(".trash");
        });
    });

    describe("search_notes", () => {
        it("should find text matches", async () => {
            const result = await searchNotesHandler({
                query: "Hello",
                path: ".",
                fileExtension: ".md",
                useRegex: false,
                fuzzy: false,
                highlight: false,
                sort: "relevance",
                snippets: 0,
                frontmatter_only: false,
                deduplicate: false,
                wildcard: false,
                offset: 0,
                showTokenEstimate: false,
            });
            expect(result.content[0].text).toContain("test.md");
        });

        it("should support regex search", async () => {
            const result = await searchNotesHandler({
                query: "#tag\\d",
                path: ".",
                fileExtension: ".md",
                useRegex: true,
                fuzzy: false,
                highlight: false,
                sort: "relevance",
                snippets: 0,
                frontmatter_only: false,
                deduplicate: false,
                wildcard: false,
                offset: 0,
                showTokenEstimate: false,
            });
            expect(result.content[0].text).toContain("tag");
        });

        it("should exclude .trash from search", async () => {
            await deleteNoteHandler({ path: "notes/test.md", permanent: false, dry_run: false });
            const result = await searchNotesHandler({
                query: "Hello",
                path: ".",
                fileExtension: ".md",
                useRegex: false,
                fuzzy: false,
                highlight: false,
                sort: "relevance",
                snippets: 0,
                frontmatter_only: false,
                deduplicate: false,
                wildcard: false,
                offset: 0,
                showTokenEstimate: false,
            });
            expect(result.content[0].text).not.toContain("test.md");
        });
    });

    describe("knowledge graph tools", () => {
        it("should extract links from a note", async () => {
            const result = await extractLinksHandler({
                path: "notes/linked.md",
                bulk: false,
                check_health: false,
                json: false,
            });
            expect(result.content[0].text).toContain("test");
        });

        it("should find backlinks to a note", async () => {
            const result = await findBacklinksHandler({ path: "test", searchPath: ".", find_orphans: false });
            expect(result.content[0].text).toContain("linked.md");
        });

        it("should detect orphan notes", async () => {
            const result = await findBacklinksHandler({ find_orphans: true, searchPath: "." });
            const text = result.content[0].text;
            expect(text).toContain("orphan");
        });

        it("should error when path missing and find_orphans is false", async () => {
            const result = (await findBacklinksHandler({ searchPath: ".", find_orphans: false })) as {
                content: { type: "text"; text: string }[];
                isError?: boolean;
            };
            expect(result.isError).toBe(true);
        });
    });

    describe("vault_status", () => {
        it("should include storage stats", async () => {
            const result = await vaultStatusHandler({
                include_stats: true,
                include_recent: false,
                include_health: false,
            });
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.total_files).toBeGreaterThanOrEqual(1);
            expect(parsed.total_size_bytes).toBeGreaterThanOrEqual(0);
            expect(parsed.largest_files).toBeDefined();
        });

        it("should include health report with empty notes", async () => {
            const result = await vaultStatusHandler({
                include_stats: false,
                include_recent: false,
                include_health: true,
            });
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.health).toBeDefined();
            expect(parsed.health.empty_notes).toBeGreaterThanOrEqual(1);
        });

        it("should report notes without frontmatter", async () => {
            const result = await vaultStatusHandler({
                include_stats: false,
                include_recent: false,
                include_health: true,
            });
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.health.notes_without_frontmatter).toBeGreaterThanOrEqual(1);
        });

        it("should include recent files", async () => {
            const result = await vaultStatusHandler({
                include_stats: false,
                include_recent: true,
                include_health: false,
            });
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.recent_files).toBeDefined();
            expect(parsed.recent_files.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe("batch operations", () => {
        it("should preview batch delete with dry_run", async () => {
            const result = await batchDeleteHandler({
                paths: ["notes/test.md", "notes/linked.md"],
                permanent: false,
                dry_run: true,
            });
            expect(result.content[0].text).toContain("DRY RUN");
            expect(result.content[0].text).toContain("Would move to trash");
            // Files should still exist
            const stillExists = await readFile(join(TEST_VAULT, "notes", "test.md"), "utf-8");
            expect(stillExists).toContain("Hello world");
        });

        it("should report missing files in batch delete", async () => {
            const result = await batchDeleteHandler({
                paths: ["notes/test.md", "notes/nonexistent.md"],
                permanent: false,
                dry_run: true,
            });
            expect(result.content[0].text).toContain("File not found");
        });

        it("should preview batch move with dry_run", async () => {
            const result = await batchMoveHandler({
                moves: [
                    { from: "notes/test.md", to: "notes/moved-a.md" },
                    { from: "notes/linked.md", to: "notes/moved-b.md" },
                ],
                dry_run: true,
            });
            expect(result.content[0].text).toContain("DRY RUN");
            expect(result.content[0].text).toContain("Would move");
            // Files should still exist at original locations
            const stillExists = await readFile(join(TEST_VAULT, "notes", "test.md"), "utf-8");
            expect(stillExists).toContain("Hello world");
        });

        it("should report missing source in batch move", async () => {
            const result = await batchMoveHandler({
                moves: [{ from: "notes/nonexistent.md", to: "notes/dest.md" }],
                dry_run: true,
            });
            expect(result.content[0].text).toContain("Source not found");
        });
    });
});
