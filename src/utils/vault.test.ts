import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initVault, resolveVaultPath, pathExists, getPathStats } from "./vault.js";

const TEST_VAULT = join(process.cwd(), "test-vault-temp");

describe("Vault Utilities", () => {
    beforeEach(async () => {
        await mkdir(TEST_VAULT, { recursive: true });
        process.argv = ["node", "index.js", TEST_VAULT];
        initVault();
    });

    afterEach(async () => {
        await rm(TEST_VAULT, { recursive: true, force: true });
    });

    describe("resolveVaultPath", () => {
        it("should resolve relative paths against vault root", () => {
            const resolved = resolveVaultPath("notes/test.md");
            expect(resolved).toBe(join(TEST_VAULT, "notes/test.md"));
        });

        it("should block path traversal attacks", () => {
            expect(() => resolveVaultPath("../../etc/passwd")).toThrow("Path traversal blocked");
        });

        it("should block absolute paths outside vault", () => {
            expect(() => resolveVaultPath("/etc/passwd")).toThrow("Path traversal blocked");
        });

        it("should normalize backslashes to forward slashes", () => {
            const resolved = resolveVaultPath("notes\\test.md");
            expect(resolved).toContain("notes");
        });
    });

    describe("pathExists", () => {
        it("should return true for existing paths", async () => {
            const testFile = join(TEST_VAULT, "test.md");
            await writeFile(testFile, "test");
            expect(await pathExists(testFile)).toBe(true);
        });

        it("should return false for non-existing paths", async () => {
            expect(await pathExists(join(TEST_VAULT, "nonexistent.md"))).toBe(false);
        });
    });

    describe("getPathStats", () => {
        it("should return correct stats for files", async () => {
            const testFile = join(TEST_VAULT, "test.md");
            await writeFile(testFile, "test content");
            const stats = await getPathStats(testFile);
            expect(stats.isFile).toBe(true);
            expect(stats.isDirectory).toBe(false);
            expect(stats.size).toBeGreaterThan(0);
        });

        it("should return correct stats for directories", async () => {
            const testDir = join(TEST_VAULT, "testdir");
            await mkdir(testDir);
            const stats = await getPathStats(testDir);
            expect(stats.isDirectory).toBe(true);
            expect(stats.isFile).toBe(false);
        });
    });
});
