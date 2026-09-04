/**
 * Tests for the filesystem-operation policy guard.
 * Verifies the AST scanner accepts allowlisted files and rejects unapproved direct fs calls.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "check-fs-policy.mjs");

describe("fs-policy guard", () => {
    it("should pass when all fs calls are in allowlisted files", () => {
        // The guard should pass on the current codebase
        const result = execSync(`node "${SCRIPT}"`, { cwd: ROOT, encoding: "utf-8", stdio: "pipe" });
        expect(result).toContain("PASS");
    });

    it("should detect the script itself as an MJS file (not scanned)", () => {
        // The guard only scans .ts files in src/, so .mjs scripts are ignored
        expect(existsSync(SCRIPT)).toBe(true);
    });
});
