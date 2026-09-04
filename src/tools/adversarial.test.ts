/**
 * Tool-level adversarial security tests.
 * These invoke actual tool handlers (not just helpers) to prove that every
 * filesystem mutation path is safe against traversal, symlink, and protected-path attacks.
 *
 * Symlink tests use a capability flag: if symlink creation fails, tests are
 * reported as skipped (not silently passed). On Windows, junction tests run
 * as an additional fallback since junctions don't require admin privileges.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdir, rm, writeFile, symlink, readFile } from "node:fs/promises";
import { symlinkSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { initVault, getVaultRoot } from "../utils/vault.js";

// Tool handlers
import * as writeNote from "./write-note.js";
import * as deleteNote from "./delete-note.js";
import * as deleteFolder from "./delete-folder.js";
import * as moveNote from "./move-note.js";
import * as restoreNote from "./restore-note.js";
import * as batchDelete from "./batch-delete.js";
import * as createNote from "./create-note.js";
import * as extractLinks from "./extract-links.js";
import * as vaultStatus from "./vault-status.js";
import * as quillRecordDecision from "./quill-record-decision.js";
import * as generateHiveCanvas from "./generate-hive-canvas.js";
import * as extractCallouts from "./extract-callouts.js";
import * as extractTags from "./extract-tags.js";
import * as readFrontmatter from "./read-frontmatter.js";
import * as writeFrontmatter from "./write-frontmatter.js";
import * as findBacklinks from "./find-backlinks.js";
import * as listNotes from "./list-notes.js";
import * as searchByName from "./search-by-name.js";
import * as watchChanges from "./watch-changes.js";
import { vaultWatcher } from "../utils/watcher.js";

const TEST_VAULT = resolve(process.cwd(), ".test-vault-adversarial");
const OUTSIDE_DIR = resolve(process.cwd(), ".test-outside-adversarial");

// ── Module-scope capability detection (before test registration) ──────
const _probeDir = resolve(process.cwd(), ".test-link-probe");

// Ensure clean probe directory
try {
    rmSync(_probeDir, { recursive: true, force: true });
} catch {
    // Ignore cleanup failures
}
mkdirSync(_probeDir, { recursive: true });
writeFileSync(join(_probeDir, "target.txt"), "probe");

const canSymlink: boolean = (() => {
    try {
        const linkPath = join(_probeDir, "_sym");
        symlinkSync(join(_probeDir, "target.txt"), linkPath);
        rmSync(linkPath, { force: true });
        return true;
    } catch {
        return false;
    }
})();

const canJunction: boolean = (() => {
    if (process.platform !== "win32") return false;
    try {
        const juncPath = join(_probeDir, "_junc");
        execSync(`mklink /J "${juncPath}" "${_probeDir}"`, { stdio: "pipe" });
        rmSync(juncPath, { force: true });
        return true;
    } catch {
        return false;
    }
})();

// Clean up probe directory
try {
    rmSync(_probeDir, { recursive: true, force: true });
} catch {
    // Ignore
}

// On Windows CI/dev, at least junctions should work — warn but don't throw
// so that non-link tests still execute and link tests are properly skipped.
if (process.platform === "win32" && !canSymlink && !canJunction) {
    console.warn(
        "[adversarial] WARNING: Windows environment supports neither symlinks nor junctions. " +
            "Link-dependent tests will be skipped.",
    );
}

const hasLinkCapability = canSymlink || canJunction;
const linkIt = hasLinkCapability ? it : it.skip;
const symlinkIt = canSymlink ? it : it.skip;

// MCP handler result shape used in tests
interface McpResult {
    isError?: boolean;
    content?: { type: string; text: string }[];
}

// Helper to check if result indicates an error
function isError(result: McpResult | undefined): boolean {
    if (result?.isError) return true;
    const text = result?.content?.[0]?.text ?? "";
    return /blocked|traversal|not found|Error/i.test(text);
}

// Safe handler call - catches thrown errors (safeHandler in index.ts does this for MCP)
async function safeCall(fn: () => Promise<McpResult>): Promise<McpResult> {
    try {
        return await fn();
    } catch (err) {
        return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
    }
}

// Helper: create a directory junction on Windows (no admin required)
function createJunction(junctionPath: string, targetPath: string): void {
    execSync(`mklink /J "${junctionPath}" "${targetPath}"`, { stdio: "pipe" });
}

// Helper: create a link using available capability (symlink or junction)
async function createLink(linkPath: string, targetPath: string): Promise<void> {
    if (canSymlink) {
        await symlink(targetPath, linkPath);
    } else {
        createJunction(linkPath, targetPath);
    }
}

beforeAll(async () => {
    await rm(TEST_VAULT, { recursive: true, force: true });
    await rm(OUTSIDE_DIR, { recursive: true, force: true });
    await mkdir(TEST_VAULT, { recursive: true });
    await mkdir(join(TEST_VAULT, "knowledge"), { recursive: true });
    await mkdir(join(TEST_VAULT, "notes"), { recursive: true });
    await mkdir(OUTSIDE_DIR, { recursive: true });
    await writeFile(join(OUTSIDE_DIR, "sentinel.txt"), "DO NOT MODIFY");
    process.env.NOTES_VAULT_PATH = TEST_VAULT;
    initVault();
});

afterAll(async () => {
    await rm(TEST_VAULT, { recursive: true, force: true });
    await rm(OUTSIDE_DIR, { recursive: true, force: true });
    delete process.env.NOTES_VAULT_PATH;
});

beforeEach(async () => {
    const dirs = [join(TEST_VAULT, "knowledge"), join(TEST_VAULT, "notes"), join(TEST_VAULT, ".trash")];
    for (const d of dirs) {
        if (existsSync(d)) await rm(d, { recursive: true, force: true });
        await mkdir(d, { recursive: true });
    }
    await writeFile(join(OUTSIDE_DIR, "sentinel.txt"), "DO NOT MODIFY");
});

// ─── Restore traversal attacks ───────────────────────────────────────

describe("Adversarial: restore_note traversal attacks", () => {
    it("rejects ../../outside-file traversal", async () => {
        await writeFile(join(TEST_VAULT, ".trash", "test.md"), "trashed");
        const result = await safeCall(() => restoreNote.handler({ path: "../../outside-file" }));
        expect(isError(result)).toBe(true);
    });

    it("rejects absolute path as restore source", async () => {
        const result = await safeCall(() => restoreNote.handler({ path: resolve(OUTSIDE_DIR, "sentinel.txt") }));
        expect(isError(result)).toBe(true);
    });

    it("rejects mixed-separator traversal", async () => {
        await writeFile(join(TEST_VAULT, ".trash", "test.md"), "trashed");
        const result = await safeCall(() => restoreNote.handler({ path: "..\\..\\outside-file" }));
        expect(isError(result)).toBe(true);
    });

    it("rejects restore to .trash itself", async () => {
        const result = await safeCall(() => restoreNote.handler({ path: "." }));
        expect(isError(result)).toBe(true);
    });

    linkIt("rejects restore through symlink inside .trash", async () => {
        const linkPath = join(TEST_VAULT, ".trash", "escape-link");
        await createLink(linkPath, OUTSIDE_DIR);
        const result = await safeCall(() => restoreNote.handler({ path: "escape-link/sentinel.txt" }));
        expect(isError(result)).toBe(true);
        const content = await readFile(join(OUTSIDE_DIR, "sentinel.txt"), "utf-8");
        expect(content).toBe("DO NOT MODIFY");
    });

    linkIt("rejects restore when destination parent is a symlink outside vault", async () => {
        const linkPath = join(TEST_VAULT, "notes", "escape-parent");
        await createLink(linkPath, OUTSIDE_DIR);
        await writeFile(join(TEST_VAULT, ".trash", "escape-parent", "test.md"), "trashed");
        const result = await safeCall(() => restoreNote.handler({ path: "escape-parent/test.md" }));
        expect(isError(result)).toBe(true);
    });
});

// ─── Write protected-path attacks ────────────────────────────────────

describe("Adversarial: write_note protected-path attacks", () => {
    it("blocks write to .trash", async () => {
        const result = await safeCall(() =>
            writeNote.handler({ path: ".trash/evil.md", content: "evil", create_if_missing: true }),
        );
        expect(isError(result)).toBe(true);
    });

    it("blocks write to .git", async () => {
        const result = await safeCall(() =>
            writeNote.handler({ path: ".git/config", content: "evil", create_if_missing: true }),
        );
        expect(isError(result)).toBe(true);
    });

    it("blocks write to .quill-sessions", async () => {
        const result = await safeCall(() =>
            writeNote.handler({ path: ".quill-sessions/evil.md", content: "evil", create_if_missing: true }),
        );
        expect(isError(result)).toBe(true);
    });

    it("blocks write to node_modules", async () => {
        const result = await safeCall(() =>
            writeNote.handler({ path: "node_modules/evil/index.md", content: "evil", create_if_missing: true }),
        );
        expect(isError(result)).toBe(true);
    });

    it("blocks write to vault root aliases", async () => {
        const result = await safeCall(() => writeNote.handler({ path: ".", content: "evil", create_if_missing: true }));
        expect(isError(result)).toBe(true);
    });

    symlinkIt("blocks write through existing symlink to external file", async () => {
        await symlink(join(OUTSIDE_DIR, "sentinel.txt"), join(TEST_VAULT, "notes", "symlink-escape.md"));
        const result = await safeCall(() =>
            writeNote.handler({ path: "notes/symlink-escape.md", content: "pwned", create_if_missing: true }),
        );
        expect(isError(result)).toBe(true);
        const content = await readFile(join(OUTSIDE_DIR, "sentinel.txt"), "utf-8");
        expect(content).toBe("DO NOT MODIFY");
    });
});

// ─── Canvas output attacks ───────────────────────────────────────────

describe("Adversarial: canvas output beneath symlinked parent", () => {
    linkIt("blocks canvas output through symlinked parent", async () => {
        const linkPath = join(TEST_VAULT, "canvases-escape");
        await createLink(linkPath, OUTSIDE_DIR);
        const result = await safeCall(() =>
            generateHiveCanvas.handler({
                output_path: "canvases-escape/hive.canvas.json",
                scan_path: "knowledge",
                include_references: false,
            }),
        );
        expect(isError(result)).toBe(true);
    });
});

// ─── delete_note with .trash linked to external directory ────────────

describe("Adversarial: delete_note with linked .trash contents", () => {
    linkIt("blocks moveToTrash when .trash/notes is a symlink to external dir", async () => {
        // Create a symlink inside .trash pointing to outside
        const linkPath = join(TEST_VAULT, ".trash", "notes");
        await createLink(linkPath, OUTSIDE_DIR);
        // Write a note to delete - it should go to .trash/notes/test.md
        await writeFile(join(TEST_VAULT, "notes", "victim.md"), "help");
        // The delete should succeed (moves to trash) but the trash destination
        // is validated canonically. The moveToTrash should detect the symlink.
        await safeCall(() => deleteNote.handler({ path: "notes/victim.md", permanent: false, dry_run: false }));
        // Verify sentinel was not modified (the file should NOT land in OUTSIDE_DIR)
        const content = await readFile(join(OUTSIDE_DIR, "sentinel.txt"), "utf-8");
        expect(content).toBe("DO NOT MODIFY");
    });
});

// ─── Soft-delete collision through malicious trash link ──────────────

describe("Adversarial: soft-delete collision through malicious trash link", () => {
    symlinkIt("blocks collision rename through symlink in .trash", async () => {
        // Pre-create a file in trash that will collide
        await writeFile(join(TEST_VAULT, ".trash", "notes", "victim.md"), "existing-trash-copy");
        // Create a symlink in trash pointing outside
        await symlink(join(OUTSIDE_DIR, "sentinel.txt"), join(TEST_VAULT, ".trash", "notes", "victim-link.md"));
        // Write a note to delete
        await writeFile(join(TEST_VAULT, "notes", "victim.md"), "help");
        await safeCall(() => deleteNote.handler({ path: "notes/victim.md", permanent: false, dry_run: false }));
        // Sentinel must remain untouched
        const content = await readFile(join(OUTSIDE_DIR, "sentinel.txt"), "utf-8");
        expect(content).toBe("DO NOT MODIFY");
    });
});

// ─── create_note template through external symlink ───────────────────

describe("Adversarial: create_note template through external symlink", () => {
    symlinkIt("blocks template read through symlink to external file", async () => {
        await symlink(join(OUTSIDE_DIR, "sentinel.txt"), join(TEST_VAULT, "notes", "evil-template.md"));
        const result = await safeCall(() =>
            createNote.handler({
                path: "notes/new-note.md",
                content: "",
                template: "notes/evil-template.md",
                auto_frontmatter: false,
                dry_run: false,
            }),
        );
        expect(isError(result)).toBe(true);
        const content = await readFile(join(OUTSIDE_DIR, "sentinel.txt"), "utf-8");
        expect(content).toBe("DO NOT MODIFY");
    });
});

// ─── Read-path containment: extract_links with symlinks ──────────────

describe("Adversarial: extract_links encounters external symlinks", () => {
    symlinkIt("skips symlinked files during bulk scan", async () => {
        await symlink(OUTSIDE_DIR, join(TEST_VAULT, "notes", "linked-dir"));
        await writeFile(join(TEST_VAULT, "notes", "real.md"), "[[link]]");
        const result = await safeCall(() =>
            extractLinks.handler({ path: "notes", bulk: true, check_health: false, json: true }),
        );
        // Should succeed but only contain real.md, not anything from the linked dir
        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content![0].text);
        const files = data.map((d: { file: string }) => d.file);
        expect(files.some((f: string) => f.includes("linked-dir"))).toBe(false);
    });
});

// ─── extract_links health-check containment ─────────────────────────

describe("Adversarial: extract_links health-check containment", () => {
    it("classifies existing in-vault target as healthy", async () => {
        await writeFile(join(TEST_VAULT, "notes", "source.md"), "[[target-note]]");
        // Health check resolves from vault root, so target must be at root
        await writeFile(join(TEST_VAULT, "target-note.md"), "# Target");
        const result = await safeCall(() =>
            extractLinks.handler({ path: "notes/source.md", bulk: false, check_health: true, json: false }),
        );
        expect(result.isError).toBeFalsy();
        const text = result.content![0].text;
        // The link should NOT be marked broken
        expect(text).not.toContain("BROKEN");
    });

    it("classifies missing in-vault target as broken", async () => {
        await writeFile(join(TEST_VAULT, "notes", "source.md"), "[[nonexistent-note]]");
        const result = await safeCall(() =>
            extractLinks.handler({ path: "notes/source.md", bulk: false, check_health: true, json: false }),
        );
        expect(result.isError).toBeFalsy();
        const text = result.content![0].text;
        expect(text).toContain("BROKEN");
        expect(text).toContain("nonexistent-note");
    });

    linkIt("classifies in-vault file symlink to external file as broken", async () => {
        // Create a symlink inside vault that points to external sentinel
        await symlink(join(OUTSIDE_DIR, "sentinel.txt"), join(TEST_VAULT, "notes", "escape-link-target.md"));
        await writeFile(join(TEST_VAULT, "notes", "source.md"), "[[notes/escape-link-target]]");
        const result = await safeCall(() =>
            extractLinks.handler({ path: "notes/source.md", bulk: false, check_health: true, json: false }),
        );
        expect(result.isError).toBeFalsy();
        const text = result.content![0].text;
        // safeReadTarget should detect the symlink escape — link must be broken
        expect(text).toContain("BROKEN");
        // Must not leak external path or sentinel content
        expect(text).not.toContain("sentinel");
        expect(text).not.toContain("DO NOT MODIFY");
        expect(text).not.toContain(OUTSIDE_DIR);
    });

    linkIt("classifies target through directory junction as broken", async () => {
        // Create a directory junction inside vault pointing outside
        const linkPath = join(TEST_VAULT, "linked-ext-health");
        await createLink(linkPath, OUTSIDE_DIR);
        await writeFile(join(TEST_VAULT, "notes", "source.md"), "[[linked-ext-health/sentinel]]");
        const result = await safeCall(() =>
            extractLinks.handler({ path: "notes/source.md", bulk: false, check_health: true, json: false }),
        );
        expect(result.isError).toBeFalsy();
        const text = result.content![0].text;
        // Target resolves outside vault through junction — must be broken
        expect(text).toContain("BROKEN");
        // Must not leak external absolute paths
        expect(text).not.toContain(OUTSIDE_DIR);
        expect(text).not.toContain("sentinel.txt");
    });

    it("does not leak absolute paths in health-check errors", async () => {
        // Attempt traversal — should be caught by resolveVaultPath before safeReadTarget
        await writeFile(join(TEST_VAULT, "notes", "source.md"), "[[../../etc/passwd]]");
        const result = await safeCall(() =>
            extractLinks.handler({ path: "notes/source.md", bulk: false, check_health: true, json: false }),
        );
        // Either succeeds with broken link or returns error — both acceptable
        const text = result.content![0].text;
        // Must never contain the vault's absolute path or resolved absolute external paths
        expect(text).not.toContain(TEST_VAULT);
        expect(text).not.toContain(resolve(TEST_VAULT, "..", ".."));
    });
});

// ─── vault_status with symlinks ──────────────────────────────────────

describe("Adversarial: vault_status encounters external symlinks", () => {
    linkIt("skips symlinked directories during status scan", async () => {
        const linkPath = join(TEST_VAULT, "linked-external");
        await createLink(linkPath, OUTSIDE_DIR);
        const result = await safeCall(() =>
            vaultStatus.handler({ include_stats: true, include_recent: true, include_health: true }),
        );
        expect(result.isError).toBeFalsy();
        // The result should not contain any paths from outside the vault
        const text = result.content![0].text;
        expect(text).not.toContain("sentinel.txt");
    });
});

// ─── Record-decision normal operation ────────────────────────────────

describe("Adversarial: record-decision normal operation", () => {
    it("quill_record_decision succeeds with normal paths", async () => {
        const result = await safeCall(() => quillRecordDecision.handler({ project: "test", content: "Test decision" }));
        expect(result).toBeDefined();
        expect(result.isError).toBeFalsy();
    });
});

// ─── Absolute vault-root deletion ────────────────────────────────────

describe("Adversarial: absolute vault-root deletion", () => {
    it("blocks delete_folder with absolute vault path", async () => {
        const result = await safeCall(() =>
            deleteFolder.handler({ path: getVaultRoot(), recursive: true, permanent: true }),
        );
        expect(isError(result)).toBe(true);
    });

    it("blocks delete_note with folder/.. traversal", async () => {
        const result = await safeCall(() =>
            deleteNote.handler({ path: "knowledge/..", permanent: true, dry_run: false }),
        );
        expect(isError(result)).toBe(true);
    });
});

// ─── Mixed-separator and case-variant protected paths ────────────────

describe("Adversarial: mixed-separator and case-variant protected paths", () => {
    it("blocks write_note with mixed separators to protected dir", async () => {
        const result = await safeCall(() =>
            writeNote.handler({ path: ".trash\\evil.md", content: "evil", create_if_missing: true }),
        );
        expect(isError(result)).toBe(true);
    });

    it("blocks batch_delete with mixed safe and unsafe entries", async () => {
        await writeFile(join(TEST_VAULT, "notes", "safe.md"), "safe");
        const result = await safeCall(() =>
            batchDelete.handler({
                paths: ["notes/safe.md", ".git/config", "node_modules/pkg/index.md"],
                permanent: false,
                dry_run: false,
            }),
        );
        // Should have partial results - safe succeeds, protected fail
        const text = result.content![0].text;
        expect(text).toContain("1/3");
    });
});

// ─── Sentinel file integrity ─────────────────────────────────────────

describe("Adversarial: sentinel file integrity", () => {
    it("external sentinel file remains unchanged after all attacks", async () => {
        // Attempt various attacks that could modify external files
        await safeCall(() =>
            writeNote.handler({
                path: "../../.test-outside-adversarial/sentinel.txt",
                content: "pwned",
                create_if_missing: true,
            }),
        );
        await safeCall(() =>
            deleteNote.handler({
                path: "../../.test-outside-adversarial/sentinel.txt",
                permanent: true,
                dry_run: false,
            }),
        );
        await safeCall(() =>
            moveNote.handler({ from: "notes/safe.md", to: "../../.test-outside-adversarial/sentinel.txt" }),
        );

        const content = await readFile(join(OUTSIDE_DIR, "sentinel.txt"), "utf-8");
        expect(content).toBe("DO NOT MODIFY");
    });
});

// ─── Read-escape: extract_callouts ────────────────────────────────────

describe("Adversarial: extract_callouts read-escape", () => {
    linkIt("blocks read through file symlink to external content", async () => {
        // Create a symlink inside vault pointing to external sentinel
        const linkPath = join(TEST_VAULT, "notes", "escape-callouts.md");
        await createLink(linkPath, join(OUTSIDE_DIR, "sentinel.txt"));
        const result = await safeCall(() => extractCallouts.handler({ path: "notes/escape-callouts.md" }));
        // safeReadTarget should detect the symlink escape and throw
        expect(isError(result)).toBe(true);
        const text = result.content![0].text;
        expect(text).not.toContain("DO NOT MODIFY");
    });

    linkIt("blocks read through directory junction to external content", async () => {
        const linkPath = join(TEST_VAULT, "linked-ext-callouts");
        await createLink(linkPath, OUTSIDE_DIR);
        const result = await safeCall(() => extractCallouts.handler({ path: "linked-ext-callouts/sentinel.md" }));
        expect(isError(result)).toBe(true);
        const text = result.content![0].text;
        expect(text).not.toContain("DO NOT MODIFY");
    });
});

// ─── Read-escape: extract_tags ────────────────────────────────────────

describe("Adversarial: extract_tags read-escape", () => {
    linkIt("blocks read through file symlink to external content", async () => {
        const linkPath = join(TEST_VAULT, "notes", "escape-tags.md");
        await createLink(linkPath, join(OUTSIDE_DIR, "sentinel.txt"));
        const result = await safeCall(() => extractTags.handler({ path: "notes/escape-tags.md" }));
        expect(isError(result)).toBe(true);
        const text = result.content![0].text;
        expect(text).not.toContain("DO NOT MODIFY");
    });

    linkIt("blocks read through directory junction to external content", async () => {
        const linkPath = join(TEST_VAULT, "linked-ext-tags");
        await createLink(linkPath, OUTSIDE_DIR);
        const result = await safeCall(() => extractTags.handler({ path: "linked-ext-tags/sentinel.md" }));
        expect(isError(result)).toBe(true);
        const text = result.content![0].text;
        expect(text).not.toContain("DO NOT MODIFY");
    });
});

// ─── Read-escape: read_frontmatter ────────────────────────────────────

describe("Adversarial: read_frontmatter read-escape", () => {
    linkIt("blocks frontmatter read through file symlink to external content", async () => {
        const linkPath = join(TEST_VAULT, "notes", "escape-fm-read.md");
        await createLink(linkPath, join(OUTSIDE_DIR, "sentinel.txt"));
        const result = await safeCall(() => readFrontmatter.handler({ path: "notes/escape-fm-read.md" }));
        expect(isError(result)).toBe(true);
        const text = result.content![0].text;
        expect(text).not.toContain("DO NOT MODIFY");
    });

    linkIt("blocks frontmatter read through directory junction to external content", async () => {
        const linkPath = join(TEST_VAULT, "linked-ext-fm");
        await createLink(linkPath, OUTSIDE_DIR);
        const result = await safeCall(() => readFrontmatter.handler({ path: "linked-ext-fm/sentinel.md" }));
        expect(isError(result)).toBe(true);
        const text = result.content![0].text;
        expect(text).not.toContain("DO NOT MODIFY");
    });
});

// ─── Read-escape: write_frontmatter ───────────────────────────────────

describe("Adversarial: write_frontmatter write-escape", () => {
    linkIt("blocks frontmatter write through file symlink to external file", async () => {
        const linkPath = join(TEST_VAULT, "notes", "escape-fm-write.md");
        await createLink(linkPath, join(OUTSIDE_DIR, "sentinel.txt"));
        const result = await safeCall(() =>
            writeFrontmatter.handler({ path: "notes/escape-fm-write.md", frontmatter: { evil: "pwned" } }),
        );
        expect(isError(result)).toBe(true);
        const content = await readFile(join(OUTSIDE_DIR, "sentinel.txt"), "utf-8");
        expect(content).toBe("DO NOT MODIFY");
    });
});

// ─── Read-escape: find_backlinks ──────────────────────────────────────

describe("Adversarial: find_backlinks symlink containment", () => {
    linkIt("does not traverse symlinked directory during backlink search", async () => {
        // Create a symlinked directory pointing outside the vault
        const linkPath = join(TEST_VAULT, "linked-ext-backlinks");
        await createLink(linkPath, OUTSIDE_DIR);
        // Write a real note that links to a target
        await writeFile(join(TEST_VAULT, "notes", "real.md"), "[[target]]");
        const result = await safeCall(() =>
            findBacklinks.handler({ path: "target", searchPath: ".", find_orphans: false }),
        );
        expect(result.isError).toBeFalsy();
        const text = result.content![0].text;
        // Must not contain any path from the external directory
        expect(text).not.toContain("linked-ext-backlinks");
        expect(text).not.toContain("sentinel");
    });

    linkIt("does not traverse symlinked directory during orphan search", async () => {
        const linkPath = join(TEST_VAULT, "linked-ext-orphans");
        await createLink(linkPath, OUTSIDE_DIR);
        await writeFile(join(TEST_VAULT, "notes", "real.md"), "# Real\nContent");
        const result = await safeCall(() => findBacklinks.handler({ searchPath: ".", find_orphans: true }));
        expect(result.isError).toBeFalsy();
        const text = result.content![0].text;
        expect(text).not.toContain("linked-ext-orphans");
        expect(text).not.toContain("sentinel");
    });
});

// ─── Read-escape: list_notes ──────────────────────────────────────────

describe("Adversarial: list_notes symlink containment", () => {
    linkIt("does not list contents of symlinked external directory", async () => {
        const linkPath = join(TEST_VAULT, "linked-ext-list");
        await createLink(linkPath, OUTSIDE_DIR);
        const result = await safeCall(() =>
            listNotes.handler({
                path: ".",
                recursive: true,
                limit: 1000,
                offset: 0,
                sort: "name_asc",
                rich: false,
                tree: false,
            }),
        );
        expect(result.isError).toBeFalsy();
        const text = result.content![0].text;
        expect(text).not.toContain("sentinel");
        expect(text).not.toContain("linked-ext-list");
    });

    linkIt("skips file symlinks in listing", async () => {
        await symlink(join(OUTSIDE_DIR, "sentinel.txt"), join(TEST_VAULT, "notes", "sym-file.md"));
        const result = await safeCall(() =>
            listNotes.handler({
                path: "notes",
                recursive: true,
                limit: 1000,
                offset: 0,
                sort: "name_asc",
                rich: false,
                tree: false,
            }),
        );
        expect(result.isError).toBeFalsy();
        const text = result.content![0].text;
        expect(text).not.toContain("sym-file");
        expect(text).not.toContain("sentinel");
    });
});

// ─── Read-escape: search_by_name ──────────────────────────────────────

describe("Adversarial: search_by_name symlink containment", () => {
    linkIt("does not search through symlinked directory", async () => {
        const linkPath = join(TEST_VAULT, "linked-ext-search");
        await createLink(linkPath, OUTSIDE_DIR);
        await writeFile(join(TEST_VAULT, "notes", "real-note.md"), "content");
        const result = await safeCall(() => searchByName.handler({ pattern: "sentinel", path: ".", recursive: true }));
        expect(result.isError).toBeFalsy();
        const text = result.content![0].text;
        // Should find nothing — sentinel is outside the vault
        expect(text).toContain("No files matching");
    });

    linkIt("skips file symlinks during name search", async () => {
        await symlink(join(OUTSIDE_DIR, "sentinel.txt"), join(TEST_VAULT, "notes", "sentinel.md"));
        const result = await safeCall(() => searchByName.handler({ pattern: "sentinel", path: ".", recursive: true }));
        expect(result.isError).toBeFalsy();
        const text = result.content![0].text;
        expect(text).toContain("No files matching");
    });
});

// ─── Read-escape: generate_hive_canvas scan ───────────────────────────

describe("Adversarial: generate_hive_canvas scan symlink containment", () => {
    linkIt("does not scan through symlinked directory in scan path", async () => {
        // Create a symlinked directory inside the knowledge scan path
        const linkPath = join(TEST_VAULT, "knowledge", "linked-ext");
        await createLink(linkPath, OUTSIDE_DIR);
        // Write a real knowledge note
        await writeFile(join(TEST_VAULT, "knowledge", "real.md"), "---\ntitle: Real\n---\n# Real\nContent [[target]]");
        const result = await safeCall(() =>
            generateHiveCanvas.handler({
                output_path: "canvases/test-hive.canvas.json",
                scan_path: "knowledge",
                include_references: false,
            }),
        );
        // Canvas generation should succeed
        expect(result.isError).toBeFalsy();
        const text = result.content![0].text;
        // The generated canvas should not reference external content
        expect(text).not.toContain("sentinel");
    });
});

// ─── Read-escape: watcher scan ────────────────────────────────────────

describe("Adversarial: watcher symlink skip", () => {
    linkIt("does not report external files through symlinked directory", async () => {
        // Initialize watcher (takes initial snapshot without the symlink)
        await vaultWatcher.initialize();
        // Now create a symlink to external directory
        const linkPath = join(TEST_VAULT, "linked-ext-watcher");
        await createLink(linkPath, OUTSIDE_DIR);
        // Trigger change detection via watch_changes handler
        const result = await safeCall(() => watchChanges.handler({ clear: true, history: false }));
        expect(result.isError).toBeFalsy();
        const text = result.content![0].text;
        // Watcher should not report any external paths
        expect(text).not.toContain("sentinel");
        expect(text).not.toContain("linked-ext-watcher");
        // Stop the watcher to avoid interference with other tests
        vaultWatcher.stop();
    });
});

// ─── Capability summary (not a security test) ────────────────────────

describe("Adversarial: environment capability summary", () => {
    it("reports symlink and junction capability", () => {
        const summary = {
            symlinks: canSymlink,
            junctions: canJunction,
            fileSymlinkCapability: canSymlink ? "available" : "unavailable",
            dirSymlinkCapability: hasLinkCapability ? "available (symlink or junction)" : "unavailable",
            linkDependentTestsRegistered: hasLinkCapability ? "executed" : "skipped via it.skip",
            symlinkOnlyTestsRegistered: canSymlink ? "executed" : "skipped via it.skip",
        };
        // Surface capability in test output
        console.log("[adversarial] capability:", JSON.stringify(summary, null, 2));
        expect(typeof summary.symlinks).toBe("boolean");
    });
});
