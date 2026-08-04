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

const TEST_VAULT = join(process.cwd(), "test-vault-temp-tools");

describe("Core Tool Tests", () => {
    beforeEach(async () => {
        await mkdir(TEST_VAULT, { recursive: true });
        await mkdir(join(TEST_VAULT, "notes"), { recursive: true });
        await writeFile(join(TEST_VAULT, "notes", "test.md"), "# Test\n\nHello world\n\n#tag1 #tag2");
        await writeFile(join(TEST_VAULT, "notes", "linked.md"), "# Linked\n\nSee [[test]] and [link](notes/test.md)\n\n#tag1 #tag3");
        process.argv = ["node", "index.js", TEST_VAULT];
        initVault();
    });

    afterEach(async () => {
        await rm(TEST_VAULT, { recursive: true, force: true });
    });

    describe("read_note", () => {
        it("should read an existing note", async () => {
            const result = await readNoteHandler({ path: "notes/test.md" });
            expect(result.content[0].text).toContain("Hello world");
        });

        it("should error for non-existing note", async () => {
            const result = await readNoteHandler({ path: "notes/nonexistent.md" });
            expect(result.isError).toBe(true);
        });
    });

    describe("write_note", () => {
        it("should create a new note", async () => {
            const result = await writeNoteHandler({ path: "notes/new.md", content: "New content" });
            expect(result.content[0].text).toContain("successfully");
            const read = await readFile(join(TEST_VAULT, "notes", "new.md"), "utf-8");
            expect(read).toBe("New content");
        });

        it("should overwrite existing note", async () => {
            await writeNoteHandler({ path: "notes/test.md", content: "Overwritten" });
            const read = await readFile(join(TEST_VAULT, "notes", "test.md"), "utf-8");
            expect(read).toBe("Overwritten");
        });
    });

    describe("create_note", () => {
        it("should create a new note", async () => {
            const result = await createNoteHandler({ path: "notes/fresh.md", content: "Fresh note" });
            expect(result.content[0].text).toContain("created");
        });

        it("should fail if note already exists", async () => {
            const result = await createNoteHandler({ path: "notes/test.md", content: "Duplicate" });
            expect(result.isError).toBe(true);
        });
    });

    describe("append_note", () => {
        it("should append content to existing note", async () => {
            await appendNoteHandler({ path: "notes/test.md", content: "\nAppended text" });
            const read = await readFile(join(TEST_VAULT, "notes", "test.md"), "utf-8");
            expect(read).toContain("Appended text");
        });
    });

    describe("soft delete and restore", () => {
        it("should move note to trash by default", async () => {
            const result = await deleteNoteHandler({ path: "notes/test.md", permanent: false });
            expect(result.content[0].text).toContain("trash");
        });

        it("should permanently delete when permanent=true", async () => {
            const result = await deleteNoteHandler({ path: "notes/test.md", permanent: true });
            expect(result.content[0].text).toContain("permanently deleted");
        });

        it("should error when deleting non-existing note", async () => {
            const result = await deleteNoteHandler({ path: "notes/nope.md", permanent: false });
            expect(result.isError).toBe(true);
        });

        it("should list items in trash", async () => {
            await deleteNoteHandler({ path: "notes/test.md", permanent: false });
            const result = await listTrashHandler({});
            expect(result.content[0].text).toContain("test.md");
        });

        it("should restore note from trash", async () => {
            await deleteNoteHandler({ path: "notes/test.md", permanent: false });
            const result = await restoreNoteHandler({ path: "notes/test.md" });
            expect(result.content[0].text).toContain("Restored");
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
            const result = await moveNoteHandler({ from: "notes/test.md", to: "../../etc/passwd" });
            expect(result.isError).toBe(true);
        });

        it("should block path traversal on copy", async () => {
            const result = await copyNoteHandler({ from: "notes/test.md", to: "../../etc/passwd" });
            expect(result.isError).toBe(true);
        });
    });

    describe("list_notes", () => {
        it("should list files in directory", async () => {
            const result = await listNotesHandler({ path: "notes", recursive: false, offset: 0 });
            expect(result.content[0].text).toContain("test.md");
        });

        it("should exclude .trash from listing", async () => {
            await deleteNoteHandler({ path: "notes/test.md", permanent: false });
            const result = await listNotesHandler({ path: ".", recursive: true, offset: 0 });
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
                offset: 0,
            });
            expect(result.content[0].text).toContain("test.md");
        });

        it("should support regex search", async () => {
            const result = await searchNotesHandler({
                query: "#tag\\d",
                path: ".",
                fileExtension: ".md",
                useRegex: true,
                offset: 0,
            });
            expect(result.content[0].text).toContain("tag");
        });

        it("should exclude .trash from search", async () => {
            await deleteNoteHandler({ path: "notes/test.md", permanent: false });
            const result = await searchNotesHandler({
                query: "Hello",
                path: ".",
                fileExtension: ".md",
                useRegex: false,
                offset: 0,
            });
            expect(result.content[0].text).not.toContain("test.md");
        });
    });

    describe("knowledge graph tools", () => {
        it("should extract links from a note", async () => {
            const result = await extractLinksHandler({ path: "notes/linked.md" });
            expect(result.content[0].text).toContain("test");
        });

        it("should find backlinks to a note", async () => {
            const result = await findBacklinksHandler({ target: "test", path: "." });
            expect(result.content[0].text).toContain("linked.md");
        });
    });
});
