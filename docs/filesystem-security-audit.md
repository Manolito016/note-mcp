# Filesystem Security Audit

> Auto-generated from repository source. Every production `node:fs` operation is classified.

## Contract

All filesystem access flows through centralized helpers in `src/utils/vault.ts`:

| Helper | Purpose | Symlink defense |
|---|---|---|
| `safeReadTarget(rel)` | Read existing files | `realpath()` canonical check via `assertWithinVault()` |
| `safeWriteTarget(rel)` | Write/create destinations | Root + protected-dir + `realpath()` (existing) or ancestor walk (new) |
| `safeDeleteTarget(rel)` | Delete targets | Root + protected-dir + `realpath()` if exists |
| `safeInternalPath(rel)` | Internal utility dirs (`.quill`, `.quill-sessions`) | Canonical check via `realpath()` |
| `safeWalkDir(dir, root, cb, skipLog?)` | Recursive traversal | `lstat()` before every recurse; structured skip diagnostics |
| `safeReadFile(abs, root)` | Generic safe read | `assertWithinRoot()` canonical check |
| `safeTrashSource(rel)` | Trash restore source | Canonical `realpath()` inside trash root |
| `safeRestoreDestination(rel)` | Trash restore destination | Canonical `realpath()` inside vault root |

**Recursive scanners** that do not use the helpers above implement their own `lstat()` symlink defense inline (marked below).

---

## Inventory

### `src/utils/vault.ts` — Centralized security helpers

| Operation | Path type | Trust boundary | Security helper | Symlink behavior | Tests |
|---|---|---|---|---|---|
| `readFileSync` (config) | Internal | Project root | N/A (startup only) | Follows symlinks (config file) | N/A — startup |
| `access` (F_OK) | Derived | Vault root | `pathExists()` | Follows symlinks | `vault.test.ts` |
| `stat` | Derived | Vault root | `getPathStats()` | Follows symlinks | `vault.test.ts` |
| `realpath` | Derived | Vault root | `assertWithinVault()`, `assertParentWithinVault()`, `assertWithinRoot()`, `safeInternalPath()` | Resolves symlinks for canonical check | `vault.test.ts`, adversarial |
| `lstat` | Derived | Vault root | `isSymlink()` | Does not follow symlinks | `vault.test.ts` |
| `readdir` | Internal | Vault root | `safeWalkDir()` | Skips symlinks via `lstat()` | `vault.test.ts` |
| `readFile` | Internal | Vault root | `safeReadFile()` | Canonical containment check | `vault.test.ts` |

### `src/utils/trash.ts` — Trash operations

| Operation | Path type | Trust boundary | Security helper | Symlink behavior | Tests |
|---|---|---|---|---|---|
| `realpath` | Derived | Trash root | `assertTrashDestSafe()`, `safeTrashSource()`, `restoreFromTrash()` | Resolves symlinks for canonical check | Adversarial restore tests |
| `lstat` | Derived | Trash root | `listTrash()`, `moveToTrash()` (via `isSymlink()`) | Detects symlinks before traversal | Adversarial |
| `rename` | Derived | Trash root ↔ Vault root | `moveToTrash()`, `restoreFromTrash()` — revalidates immediately before rename | Canonical check before rename | Adversarial restore + delete tests |
| `mkdir` | Derived | Trash root | `moveToTrash()`, `restoreFromTrash()` | Creates dirs inside trash/vault | Adversarial |
| `readdir` | Derived | Trash root | `listTrash()` → `scanDir()` | `lstat()` symlink skip | `trash.test.ts` |

### `src/utils/knowledge-index.ts` — Knowledge indexing

| Operation | Path type | Trust boundary | Security helper | Symlink behavior | Tests |
|---|---|---|---|---|---|
| `readdir` | Derived | Vault root | `scan()` recursive | `lstat()` inline symlink skip | `discovery.test.ts` |
| `lstat` | Derived | Vault root | `scan()` recursive | Detects symlinks/junctions | `discovery.test.ts` |
| `stat` | Derived | Vault root | `scan()` file info | Follows symlinks (after lstat gate) | `discovery.test.ts` |
| `readFile` | Derived | Vault root | `scan()` file content | Only reads files that passed lstat gate | `discovery.test.ts` |

### `src/utils/search-index.ts` — BM25 search index

| Operation | Path type | Trust boundary | Security helper | Symlink behavior | Tests |
|---|---|---|---|---|---|
| `readdir` | Derived | Vault root | `synchronize()` recursive | `lstat()` inline symlink skip | `search-index.test.ts` |
| `lstat` | Derived | Vault root | `synchronize()` recursive | Detects symlinks | `search-index.test.ts` |
| `stat` | Derived | Vault root | File metadata | Follows symlinks (after lstat gate) | `search-index.test.ts` |
| `readFile` | Derived | Vault root | File content indexing | Only reads files that passed lstat gate | `search-index.test.ts` |

### `src/utils/metadata-index.ts` — Memory metadata index

| Operation | Path type | Trust boundary | Security helper | Symlink behavior | Tests |
|---|---|---|---|---|---|
| `readdir` | Derived | Vault root | `rebuild()` recursive | `lstat()` inline symlink skip | Unit tests |
| `lstat` | Derived | Vault root | `rebuild()` recursive | Detects symlinks | Unit tests |
| `readFile` | Derived | Vault root | Frontmatter parsing | Only reads files that passed lstat gate | Unit tests |

### `src/utils/graph.ts` — Vault graph scanning

| Operation | Path type | Trust boundary | Security helper | Symlink behavior | Tests |
|---|---|---|---|---|---|
| `readdir` | Derived | Vault root | `scanVaultNotes()` → `scanDir()` | `lstat()` inline symlink skip | Adversarial canvas scan test |
| `lstat` | Derived | Vault root | `scanVaultNotes()` → `scanDir()` | Detects symlinks | Adversarial canvas scan test |
| `readFile` | Derived | Vault root | Note content parsing | Only reads files that passed lstat gate | Adversarial canvas scan test |

### `src/utils/watcher.ts` — File change polling

| Operation | Path type | Trust boundary | Security helper | Symlink behavior | Tests |
|---|---|---|---|---|---|
| `readdir` | Derived | Vault root | `scanDirectory()`, `scanCurrentState()` | `lstat()` inline symlink skip | Adversarial watcher test |
| `lstat` | Derived | Vault root | `scanDirectory()`, `scanCurrentState()` | Detects symlinks | Adversarial watcher test |
| `stat` | Derived | Vault root | File snapshot mtime/size | Follows symlinks (after lstat gate) | Adversarial watcher test |

### `src/utils/checkpoint.ts` — Memory checkpoints

| Operation | Path type | Trust boundary | Security helper | Symlink behavior | Tests |
|---|---|---|---|---|---|
| `readFile` | Internal | `.quill/` via `safeInternalPath()` | `safeInternalPath()` | Canonical realpath check | Unit tests |
| `writeFile` | Internal | `.quill/` via `safeInternalPath()` | `safeInternalPath()` | Canonical realpath check | Unit tests |
| `mkdir` | Internal | `.quill/` via `safeInternalPath()` | `safeInternalPath()` | Canonical realpath check | Unit tests |

### `src/utils/audit-log.ts` — Audit log

| Operation | Path type | Trust boundary | Security helper | Symlink behavior | Tests |
|---|---|---|---|---|---|
| `readFile` | Internal | `.quill/` via `safeInternalPath()` | `safeInternalPath()` | Canonical realpath check | Unit tests |
| `writeFile` | Internal | `.quill/` via `safeInternalPath()` | `safeInternalPath()` | Canonical realpath check | Unit tests |
| `mkdir` | Internal | `.quill/` via `safeInternalPath()` | `safeInternalPath()` | Canonical realpath check | Unit tests |

### `src/utils/session-tracker.ts` — Session tracking

| Operation | Path type | Trust boundary | Security helper | Symlink behavior | Tests |
|---|---|---|---|---|---|
| `readFile` | Internal | `.quill-sessions/` via `safeInternalPath()` | `safeInternalPath()` | Canonical realpath check | Unit tests |
| `writeFile` | Internal | `.quill-sessions/` via `safeInternalPath()` | `safeInternalPath()` | Canonical realpath check | Unit tests |
| `mkdir` | Internal | `.quill-sessions/` via `safeInternalPath()` | `safeInternalPath()` | Canonical realpath check | Unit tests |

### `src/utils/config.ts` — Configuration

| Operation | Path type | Trust boundary | Security helper | Symlink behavior | Tests |
|---|---|---|---|---|---|
| `readFileSync` | Internal | Project root | N/A (startup config) | Follows symlinks | N/A — startup |

---

### Tool handlers (`src/tools/`)

Every tool handler resolves paths through the centralized contract before any filesystem call.

| Tool file | FS operations | Path resolution | Containment | Symlink defense | Tests |
|---|---|---|---|---|---|
| `read-note.ts` | `readFile` | `safeReadTarget()` | Vault root | `realpath()` canonical | Unit + adversarial |
| `write-note.ts` | `writeFile`, `mkdir`, `stat` | `safeWriteTarget()` | Vault root + protected | `realpath()` canonical + ancestor walk | Adversarial write tests |
| `create-note.ts` | `writeFile`, `mkdir`, `readFile` | `safeWriteTarget()` (dest), `safeReadTarget()` (template) | Vault root | `realpath()` canonical | Adversarial template symlink test |
| `delete-note.ts` | `unlink`, `readdir`, `lstat` | `safeDeleteTarget()` (single), `resolveVaultPath()` (glob base) | Vault root + protected | `lstat()` inline in glob scanner | Adversarial delete tests |
| `move-note.ts` | `rename`, `mkdir` | `safeDeleteTarget()` (src), `safeWriteTarget()` (dest) | Vault root + protected | `realpath()` canonical | Adversarial sentinel test |
| `append-note.ts` | `appendFile`, `readFile`, `writeFile` | `safeWriteTarget()` | Vault root + protected | `realpath()` canonical | Unit tests |
| `extract-links.ts` | `readFile`, `readdir`, `lstat` | `safeReadTarget()` (single), `lstat()` (bulk scan) | Vault root | `realpath()` + `lstat()` inline | Adversarial bulk scan test |
| `extract-callouts.ts` | `readFile` | `safeReadTarget()` | Vault root | `realpath()` canonical | Adversarial read-escape test |
| `extract-tags.ts` | `readFile` | `safeReadTarget()` | Vault root | `realpath()` canonical | Adversarial read-escape test |
| `find-backlinks.ts` | `readdir`, `readFile`, `lstat` | `resolveVaultPath()` (search dir) | Vault root | `lstat()` inline in `searchDir()` + `scanDir()` | Adversarial read-escape test |
| `list-notes.ts` | `readdir`, `stat`, `lstat` | `resolveVaultPath()` | Vault root | `lstat()` inline in `listDir()` | Adversarial read-escape test |
| `search-by-name.ts` | `readdir`, `lstat` | `resolveVaultPath()` | Vault root | `lstat()` inline in `searchDir()` | Adversarial read-escape test |
| `vault-status.ts` | `readdir`, `stat`, `lstat` | `getVaultRoot()` | Vault root | `lstat()` inline in all 4 scanners | Adversarial symlink test |
| `generate-hive-canvas.ts` | `readFile`, `writeFile`, `mkdir` | `safeWriteTarget()` (output), `resolveVaultPath()` (scan) | Vault root | `lstat()` via `scanVaultNotes()` + `safeWriteTarget()` | Adversarial canvas output + scan tests |
| `create-template.ts` | `writeFile`, `mkdir` | `safeWriteTarget()` | Vault root + protected | `realpath()` canonical | Unit tests |
| `update-frontmatter.ts` | `readFile`, `writeFile` | `safeWriteTarget()` | Vault root + protected | `realpath()` canonical | Unit tests |
| `frontmatter.ts` | `readFile`, `writeFile` | `safeReadTarget()` (read), `safeWriteTarget()` (write) | Vault root | `realpath()` canonical | Adversarial read-escape test |
| `read-frontmatter.ts` | `readFile` | `safeReadTarget()` | Vault root | `realpath()` canonical | Adversarial read-escape test |
| `write-frontmatter.ts` | `readFile`, `writeFile` | `safeWriteTarget()` | Vault root + protected | `realpath()` canonical | Adversarial write-escape test |
| `batch-delete.ts` | `unlink` | `safeDeleteTarget()` per file | Vault root + protected | `realpath()` canonical | Adversarial batch test |
| `batch-move.ts` | `rename`, `mkdir` | `safeDeleteTarget()` (src), `safeWriteTarget()` (dest) | Vault root + protected | `realpath()` canonical | Unit tests |
| `rename-folder.ts` | `rename`, `mkdir` | `safeDeleteTarget()` (src), `safeWriteTarget()` (dest) | Vault root + protected | `realpath()` canonical | Unit tests |
| `delete-folder.ts` | `readdir`, `lstat`, `unlink`, `rm` | `safeDeleteTarget()` | Vault root + protected | `lstat()` inline in recursive delete | Unit tests |
| `restore-note.ts` | (via `trash.ts`) | `safeTrashSource()`, `safeRestoreDestination()` | Trash root ↔ Vault root | `realpath()` canonical + revalidation | Adversarial restore tests |
| `quill-record-decision.ts` | `writeFile`, `mkdir` | `safeInternalPath()` | Internal `.quill/` | Canonical realpath | Unit tests |
| `quill-record-discovery.ts` | `writeFile`, `mkdir` | `safeInternalPath()` | Internal `.quill/` | Canonical realpath | Unit tests |
| `quill-record-lesson.ts` | `writeFile`, `mkdir` | `safeInternalPath()` | Internal `.quill/` | Canonical realpath | Unit tests |
| `quill-write.ts` | `writeFile`, `mkdir` | `safeInternalPath()` | Internal `.quill/` | Canonical realpath | Unit tests |
| `watch-changes.ts` | (via `watcher.ts`) | `getVaultRoot()` | Vault root | `lstat()` via watcher | Adversarial watcher test |

---

## Accepted Limitations

### TOCTOU (Time-of-Check-to-Time-of-Use)

**This project does NOT claim race-free filesystem safety.** The following limitations are inherent to the platform and cannot be eliminated:

1. **No portable `O_NOFOLLOW` workflow.** Node.js on Windows (and POSIX for that matter) does not expose a portable `O_NOFOLLOW` flag suitable for every operation used here. Operations like `readdir()`, `rename()`, and `readFile()` cannot atomically verify that a path has not been replaced by a symlink between the check and the act.

2. **Stat-then-act pattern.** Every `realpath()` + `assertWithinVault()` followed by a subsequent filesystem operation (`readFile`, `writeFile`, `rename`, `unlink`) is a stat-then-act pattern. The validation and the operation are two separate syscalls with a gap between them.

3. **Revalidation narrows but does not close the window.** The trash module (`trash.ts`) performs immediate revalidation before destructive `rename()` operations. This narrows the race window to the minimum possible in userspace, but does not close it. A concurrent filesystem mutation between the revalidation and the rename can still invalidate the check.

4. **Concurrent mutation is theoretical but possible.** If another process creates, deletes, or replaces a file with a symlink between the containment check and the filesystem operation, the operation could act on an unintended target. The MCP server is single-process, so this requires an external actor.

5. **Accepted platform limitation.** This is addressed through defense in depth:
   - `lstat()` gate before every recursive traversal step
   - `realpath()` canonical containment on every entry/exit point
   - Immediate revalidation before destructive operations
   - Contained error messages that do not leak external paths
   - The vault is not expected to have concurrent writers during tool execution

**Risk**: Low in practice. The single-process MCP server model and the absence of concurrent external writers make TOCTOU exploitation unlikely. However, it cannot be formally eliminated on this platform.

### `readFileSync` at startup

`vault.ts` and `config.ts` use `readFileSync` during vault root resolution and config loading. These paths are derived from CLI arguments, environment variables, or well-known config file locations — not from user-controlled tool input. Symlink following here is acceptable because the operator who sets the environment controls these paths.

### `stat()` after `lstat()` gate

Several scanners call `stat()` on files that already passed an `lstat()` symlink check. If a symlink is created between the `lstat()` and `stat()` calls (TOCTOU), the `stat()` could follow it. The window is minimal (back-to-back async calls) and the scanner would still be bounded by the vault root directory.

---

## Symlink Defense Summary

| Layer | Mechanism | Covers |
|---|---|---|
| Path resolution | `resolve()` + relative prefix check | `..` traversal, absolute paths, mixed separators |
| Canonical check | `realpath()` + relative prefix check | File symlinks, directory symlinks, Windows junctions |
| Recursive traversal | `lstat()` before every directory recurse | Symlinks encountered during bulk scans |
| Protected directories | Segment-aware name matching | `.trash`, `.git`, `.quill-sessions`, `node_modules` |
| Trash-specific | `assertTrashDestSafe()` + `assertWithinTrash()` | Trash escape via rename, collision, or symlink |

---

## Automated Enforcement

### Filesystem-operation policy guard (`scripts/check-fs-policy.mjs`)

An AST-based scanner inspects all production `.ts` files in `src/` for direct use of `node:fs` and `node:fs/promises` APIs. Files outside the explicit allowlist trigger a CI failure.

**Run**: `npm run fs-policy` or `node scripts/check-fs-policy.mjs`

**Detected APIs**: `readFile`, `writeFile`, `appendFile`, `readdir`, `stat`, `lstat`, `realpath`, `rename`, `copyFile`, `unlink`, `rm`, `mkdir`, `watch`, `createReadStream`, `createWriteStream`, `open`, `access` (and their `Sync` variants).

**Allowlist maintenance**:
1. Review the new file to ensure all fs calls use centralized security helpers or have inline `lstat()` symlink defense.
2. Add the relative path to the `ALLOWLIST` set in `scripts/check-fs-policy.mjs`.
3. Update this audit document with the new entry.

**Scope**: Excludes test files (`*.test.ts`), benchmarks, and templates.
