import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initVault } from "../utils/vault.js";
import { handler as moveNoteHandler } from "./move-note.js";
import { handler as copyNoteHandler } from "./copy-note.js";
import { handler as batchDeleteHandler } from "./batch-delete.js";

const TEST_VAULT = join(process.cwd(), "test-vault-temp-tools-security");

describe("Tool Security Tests", () => {
    beforeEach(async () => {
        try {
            await rm(TEST_VAULT, { recursive: true, force: true });
        } catch {
            // Ignore cleanup failures from previous runs
        }
        await mkdir(TEST_VAULT, { recursive: true });
        await mkdir(join(TEST_VAULT, "notes"), { recursive: true });
        await writeFile(join(TEST_VAULT, "notes", "test.md"), "test content");
        process.env.NOTES_VAULT_PATH = TEST_VAULT;
        delete process.argv[2];
        initVault();
    });

    afterEach(async () => {
        delete process.env.NOTES_VAULT_PATH;
        try {
            await rm(TEST_VAULT, { recursive: true, force: true });
        } catch {
            // Windows may lock files briefly
        }
    });

    describe("move_note path traversal", () => {
        it("should block moves outside vault", async () => {
            // resolveVaultPath throws on path traversal — handlers don't catch when called directly
            // (safeHandler in index.ts catches in production)
            await expect(moveNoteHandler({ from: "notes/test.md", to: "../../etc/passwd" })).rejects.toThrow(
                "Path traversal blocked",
            );
        });
    });

    describe("copy_note path traversal", () => {
        it("should block copies outside vault", async () => {
            await expect(copyNoteHandler({ from: "notes/test.md", to: "../../etc/passwd" })).rejects.toThrow(
                "Path traversal blocked",
            );
        });
    });

    describe("batch_delete", () => {
        it("should handle multiple files", async () => {
            await writeFile(join(TEST_VAULT, "notes", "file1.md"), "content1");
            await writeFile(join(TEST_VAULT, "notes", "file2.md"), "content2");

            const result = await batchDeleteHandler({ paths: ["notes/file1.md", "notes/file2.md"], permanent: false });
            expect(result.content[0].text).toContain("2/2");
            expect(result.content[0].text).toContain("moved to trash");
        });

        it("should report missing files", async () => {
            const result = await batchDeleteHandler({ paths: ["notes/nonexistent.md"], permanent: false });
            expect(result.content[0].text).toContain("0/1");
            expect(result.content[0].text).toContain("File not found");
        });
    });
});
