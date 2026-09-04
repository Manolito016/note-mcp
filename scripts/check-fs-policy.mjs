/**
 * Filesystem-operation policy guard.
 *
 * AST-based scan of production source files that detects direct use of
 * node:fs / node:fs/promises APIs outside an explicit allowlist.
 *
 * Allowed modules (centralized filesystem/security boundary):
 *   - src/utils/vault.ts        — core path-security helpers
 *   - src/utils/trash.ts        — trash-specific canonical validation
 *   - src/utils/watcher.ts      — file watcher with lstat defense
 *   - src/utils/knowledge-index.ts — knowledge scanner with lstat defense
 *   - src/utils/search-index.ts    — search scanner with lstat defense
 *   - src/utils/metadata-index.ts  — metadata scanner with lstat defense
 *   - src/utils/graph.ts           — graph scanner with lstat defense
 *   - src/utils/checkpoint.ts      — checkpoint I/O via safeInternalPath
 *   - src/utils/audit-log.ts       — audit log I/O via safeInternalPath
 *   - src/utils/session-tracker.ts — session I/O via safeInternalPath
 *   - src/utils/config.ts          — config file reader
 *   - src/utils/consolidation.ts   — consolidation I/O
 *   - src/utils/conflict-engine.ts — conflict detection reads
 *   - src/utils/retrieval-engine.ts — retrieval reads
 *   - src/utils/logger.ts          — log file writer
 *   - src/tools/generate-hive-canvas.ts — canvas output writer (uses safeWriteTarget)
 *   - src/tools/extract-links.ts   — bulk scanner with lstat defense
 *   - src/tools/list-notes.ts      — list scanner with lstat defense
 *   - src/tools/find-backlinks.ts  — backlink scanner with lstat defense
 *   - src/tools/search-by-name.ts  — name search with lstat defense
 *   - src/tools/vault-status.ts    — status scanner with lstat defense
 *   - src/tools/delete-note.ts     — glob scanner with lstat defense
 *   - src/benchmarks/*             — benchmarks (not production)
 *
 * Usage:
 *   node scripts/check-fs-policy.mjs
 *
 * Exit code 0 = pass, 1 = violations found.
 *
 * To add a new file to the allowlist:
 *   1. Review the file to ensure all fs calls use centralized security helpers
 *      (safeReadTarget, safeWriteTarget, safeDeleteTarget, safeInternalPath,
 *      safeWalkDir, safeReadFile) or have inline lstat() symlink defense.
 *   2. Add the relative path to the ALLOWLIST set below.
 *   3. Update docs/filesystem-security-audit.md with the new entry.
 */

import ts from "typescript";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

/** FS APIs that require allowlist justification. */
const FS_APIS = new Set([
    "readFile",
    "readFileSync",
    "writeFile",
    "writeFileSync",
    "appendFile",
    "appendFileSync",
    "readdir",
    "readdirSync",
    "stat",
    "statSync",
    "lstat",
    "lstatSync",
    "realpath",
    "realpathSync",
    "rename",
    "renameSync",
    "copyFile",
    "copyFileSync",
    "unlink",
    "unlinkSync",
    "rm",
    "rmSync",
    "mkdir",
    "mkdirSync",
    "watch",
    "watchSync",
    "createReadStream",
    "createWriteStream",
    "open",
    "openSync",
    "access",
    "accessSync",
]);

/**
 * Allowlist: production files that may directly use node:fs APIs.
 * Each entry must use centralized security helpers or have inline lstat defense.
 */
const ALLOWLIST = new Set([
    // ── Core security modules ──
    "src/utils/vault.ts",
    "src/utils/trash.ts",
    "src/utils/watcher.ts",
    "src/utils/knowledge-index.ts",
    "src/utils/search-index.ts",
    "src/utils/metadata-index.ts",
    "src/utils/graph.ts",
    "src/utils/checkpoint.ts",
    "src/utils/audit-log.ts",
    "src/utils/session-tracker.ts",
    "src/utils/config.ts",
    "src/utils/consolidation.ts",
    "src/utils/conflict-engine.ts",
    "src/utils/retrieval-engine.ts",
    "src/utils/logger.ts",
    "src/utils/frontmatter.ts",
    // ── Tool handlers (validate via safe*Target, then perform I/O) ──
    "src/tools/generate-hive-canvas.ts",
    "src/tools/extract-links.ts",
    "src/tools/extract-callouts.ts",
    "src/tools/extract-tags.ts",
    "src/tools/list-notes.ts",
    "src/tools/find-backlinks.ts",
    "src/tools/search-by-name.ts",
    "src/tools/vault-status.ts",
    "src/tools/delete-note.ts",
    "src/tools/read-note.ts",
    "src/tools/write-note.ts",
    "src/tools/append-note.ts",
    "src/tools/create-note.ts",
    "src/tools/copy-note.ts",
    "src/tools/move-note.ts",
    "src/tools/batch-delete.ts",
    "src/tools/batch-move.ts",
    "src/tools/frontmatter.ts",
    "src/tools/read-frontmatter.ts",
    "src/tools/write-frontmatter.ts",
    "src/tools/update-frontmatter.ts",
    "src/tools/create-folder.ts",
    "src/tools/create-template.ts",
    "src/tools/delete-folder.ts",
    "src/tools/rename-folder.ts",
    "src/tools/quill-write.ts",
    "src/tools/quill-record-decision.ts",
    "src/tools/quill-record-discovery.ts",
    "src/tools/quill-record-lesson.ts",
]);

/** Directories/patterns to skip entirely. */
const SKIP_PATTERNS = [
    /\.test\.ts$/,
    /\.test\./,
    /[/\\]benchmarks[/\\]/,
    /[/\\]templates[/\\]/,
];

async function getAllTsFiles(dir) {
    const results = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...(await getAllTsFiles(fullPath)));
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
            results.push(fullPath);
        }
    }
    return results;
}

function findFsViolations(filePath, sourceText) {
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    const violations = [];

    // Track which identifiers are imported from node:fs or node:fs/promises
    const fsImportedNames = new Set();
    // Track namespace imports from fs
    const fsNamespaceNames = new Set();

    function visit(node) {
        // import { readFile } from "node:fs/promises"
        // import * as fs from "node:fs"
        if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
            const moduleText = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, "");
            if (moduleText === "node:fs" || moduleText === "node:fs/promises" || moduleText === "fs" || moduleText === "fs/promises") {
                const clause = node.importClause;
                if (clause) {
                    // Default import: import fs from "node:fs"
                    if (clause.name) {
                        fsNamespaceNames.add(clause.name.text);
                    }
                    // Named imports: import { readFile } from "node:fs"
                    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
                        for (const element of clause.namedBindings.elements) {
                            const importedName = element.propertyName?.text ?? element.name.text;
                            const localName = element.name.text;
                            if (FS_APIS.has(importedName)) {
                                fsImportedNames.add(localName);
                            }
                        }
                    }
                    // Namespace import: import * as fs from "node:fs"
                    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
                        fsNamespaceNames.add(clause.namedBindings.name.text);
                    }
                }
            }
        }

        // Direct function calls: readFile(...), fs.readFile(...)
        if (ts.isCallExpression(node)) {
            const expr = node.expression;
            // Direct call: readFile(...)
            if (ts.isIdentifier(expr) && fsImportedNames.has(expr.text)) {
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(expr.getStart(sourceFile));
                violations.push({
                    api: expr.text,
                    line: line + 1,
                    character: character + 1,
                    type: "direct",
                });
            }
            // Namespace call: fs.readFile(...)
            if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
                const nsName = expr.expression.text;
                const methodName = expr.name.text;
                if (fsNamespaceNames.has(nsName) && FS_APIS.has(methodName)) {
                    const { line, character } = sourceFile.getLineAndCharacterOfPosition(expr.getStart(sourceFile));
                    violations.push({
                        api: `${nsName}.${methodName}`,
                        line: line + 1,
                        character: character + 1,
                        type: "namespace",
                    });
                }
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return violations;
}

async function main() {
    const allFiles = await getAllTsFiles(SRC);
    let totalViolations = 0;
    const violationFiles = [];

    for (const filePath of allFiles) {
        const relPath = relative(ROOT, filePath).replace(/\\/g, "/");

        // Skip test files, benchmarks, templates
        if (SKIP_PATTERNS.some((p) => p.test(relPath))) continue;

        // Skip allowlisted files
        if (ALLOWLIST.has(relPath)) continue;

        const sourceText = await readFile(filePath, "utf-8");
        const violations = findFsViolations(filePath, sourceText);

        if (violations.length > 0) {
            totalViolations += violations.length;
            violationFiles.push({ file: relPath, violations });
        }
    }

    if (totalViolations === 0) {
        console.log("[fs-policy] PASS — no unreviewed filesystem operations found in production code.");
        process.exit(0);
    }

    console.error(`[fs-policy] FAIL — ${totalViolations} unreviewed filesystem operation(s) found:\n`);
    for (const { file, violations } of violationFiles) {
        console.error(`  ${file}:`);
        for (const v of violations) {
            console.error(`    Line ${v.line}:${v.character} — ${v.api} (${v.type} call)`);
        }
    }
    console.error(
        `\n[fs-policy] All production filesystem operations must flow through centralized security helpers.`,
    );
    console.error(`[fs-policy] If this is a justified new usage, add the file to the ALLOWLIST in scripts/check-fs-policy.mjs`);
    console.error(`[fs-policy] and update docs/filesystem-security-audit.md.\n`);
    process.exit(1);
}

main().catch((err) => {
    console.error("[fs-policy] Error:", err);
    process.exit(2);
});
