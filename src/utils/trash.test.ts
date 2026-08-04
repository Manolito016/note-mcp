import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { initVault, resolveVaultPath, pathExists } from "../utils/vault.js";
import { moveToTrash, restoreFromTrash, isInTrash, listTrash, getTrashPath } from "../utils/trash.js";

const TEST_VAULT = join(process.cwd(), "test-vault-temp-trash");

describe("Trash Utilities", () => {
    beforeEach(async () => {
        await mkdir(TEST_VAULT, { recursive: true });
        await mkdir(join(TEST_VAULT, "notes"), { recursive: true });
        await writeFile(join(TEST_VAULT, "notes", "test.md"), "test content");
        await writeFile(join(TEST_VAULT, "notes", "another.md"), "another content");
        process.argv = ["node", "index.js", TEST_VAULT];
        initVault();
    });

    afterEach(async () => {
        await rm(TEST_VAULT, { recursive: true, force: true });
    });

    describe("moveToTrash", () => {
        it("should move a file to .trash preserving relative path", async () => {
            const filePath = join(TEST_VAULT, "notes", "test.md");
            const trashDest = await moveToTrash(filePath);

            expect(trashDest).toContain(".trash");
            expect(trashDest).toContain("notes");
            expect(trashDest).toContain("test.md");
            expect(await pathExists(filePath)).toBe(false);
            expect(await pathExists(trashDest)).toBe(true);
        });

        it("should handle name collision by appending timestamp", async () => {
            const filePath = join(TEST_VAULT, "notes", "test.md");

            // Move first time
            await moveToTrash(filePath);

            // Create file again and move again
            await writeFile(filePath, "new content");
            const secondDest = await moveToTrash(filePath);

            expect(secondDest).toContain("__");
            expect(await pathExists(secondDest)).toBe(true);
        });
    });

    describe("restoreFromTrash", () => {
        it("should restore a file from trash to original location", async () => {
            const filePath = join(TEST_VAULT, "notes", "test.md");
            const trashDest = await moveToTrash(filePath);

            const restoredPath = await restoreFromTrash(trashDest);

            expect(restoredPath).toContain("notes");
            expect(restoredPath).toContain("test.md");
            expect(await pathExists(restoredPath)).toBe(true);
            expect(await pathExists(trashDest)).toBe(false);
        });

        it("should handle collision at restore destination", async () => {
            const filePath = join(TEST_VAULT, "notes", "test.md");
            const trashDest = await moveToTrash(filePath);

            // Create a file at the original location
            await writeFile(filePath, "blocking file");

            const restoredPath = await restoreFromTrash(trashDest);

            // Should have a different name due to collision
            expect(restoredPath).toContain("__restored_");
            expect(await pathExists(filePath)).toBe(true);
            expect(await pathExists(restoredPath)).toBe(true);
        });
    });

    describe("isInTrash", () => {
        it("should return true for paths inside .trash", () => {
            const trashPath = join(getTrashPath(), "notes", "test.md");
            expect(isInTrash(trashPath)).toBe(true);
        });

        it("should return false for paths outside .trash", () => {
            const normalPath = join(TEST_VAULT, "notes", "test.md");
            expect(isInTrash(normalPath)).toBe(false);
        });
    });

    describe("listTrash", () => {
        it("should return empty array when trash is empty", async () => {
            const items = await listTrash();
            expect(items).toEqual([]);
        });

        it("should list items in trash", async () => {
            const filePath = join(TEST_VAULT, "notes", "test.md");
            await moveToTrash(filePath);

            const items = await listTrash();
            expect(items.length).toBe(1);
            expect(items[0].path).toContain("test.md");
            expect(items[0].isFile).toBe(true);
        });
    });
});
