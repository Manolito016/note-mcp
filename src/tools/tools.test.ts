import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initVault } from "../utils/vault.js";
import { handler as moveNoteHandler } from "./move-note.js";
import { handler as copyNoteHandler } from "./copy-note.js";
import { handler as batchDeleteHandler } from "./batch-delete.js";

const TEST_VAULT = join(process.cwd(), "test-vault-temp-tools");

describe("Tool Security Tests", () => {
    beforeEach(async () => {
        await mkdir(TEST_VAULT, { recursive: true });
        await mkdir(join(TEST_VAULT, "notes"), { recursive: true });
        await writeFile(join(TEST_VAULT, "notes", "test.md"), "test content");
        process.argv = ["node", "index.js", TEST_VAULT];
        initVault();
    });

    afterEach(async () => {
        await rm(TEST_VAULT, { recursive: true, force: true });
    });

    describe("move_note path traversal", () => {
        it("should block moves outside vault", async () => {
            const result = await moveNoteHandler({ from: "notes/test.md", to: "../../etc/passwd" });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("Path traversal blocked");
        });
    });

    describe("copy_note path traversal", () => {
        it("should block copies outside vault", async () => {
            const result = await copyNoteHandler({ from: "notes/test.md", to: "../../etc/passwd" });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("Path traversal blocked");
        });
    });

    describe("batch_delete", () => {
        it("should handle multiple files", async () => {
            await writeFile(join(TEST_VAULT, "notes", "file1.md"), "content1");
            await writeFile(join(TEST_VAULT, "notes", "file2.md"), "content2");

            const result = await batchDeleteHandler({ paths: ["notes/file1.md", "notes/file2.md"] });
            expect(result.content[0].text).toContain("Deleted 2/2 files");
        });

        it("should report missing files", async () => {
            const result = await batchDeleteHandler({ paths: ["notes/nonexistent.md"] });
            expect(result.content[0].text).toContain("Deleted 0/1 files");
            expect(result.content[0].text).toContain("File not found");
        });
    });
});
