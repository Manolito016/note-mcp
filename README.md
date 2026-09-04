<p align="center">
  <img src="assets/logo.png" alt="quill-mcp" width="200" />
</p>

# quill-mcp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for managing a markdown notes vault. Gives AI assistants the ability to create, read, update, delete, move, search, and organize markdown notes on the local filesystem.

---

## Project Context

> This section exists so an AI agent can restore full project context after a context window reset.

### What This Is

quill-mcp is a **stdio-based MCP server** written in TypeScript. It runs as a child process started by an MCP client (Qoder, Claude Desktop, etc.) and exposes **49 tools** for managing a local markdown vault with a persistent memory intelligence layer. It is NOT a standalone app — it is always launched and managed by the host MCP client.

### GitHub

- **Repo:** https://github.com/Manolito016/quill-mcp
- **License:** MIT

### Runtime Environment

- **Node.js:** >= 18.0.0 (v22 LTS recommended; v24 has a silent crash bug on Windows — avoid)
- **Vault location:** Configurable via CLI arg, env var, or config file (see Configuration section)

### Architecture

```
Client (Qoder/Claude) ←stdio→ index.ts → tool handlers → vault filesystem
                                      → memory intelligence layer (BM25, conflict detection, checkpoints)
```

- **Transport:** stdio (JSON-RPC over stdin/stdout)
- **SDK:** `@modelcontextprotocol/sdk` v1.29+
- **Validation:** Zod schemas on every tool input
- **Error handling:** Every tool handler is wrapped in `safeHandler()` — catches exceptions and returns MCP error responses instead of crashing the process
- **Crash protection:** `uncaughtException` and `unhandledRejection` listeners registered at startup
- **Keepalive:** 60-second heartbeat interval prevents idle pipe timeouts

### Tool Registration Pattern

Each tool is a separate file in `src/tools/` exporting:
```typescript
export const name = "tool_name";
export const description = "...";
export const inputSchema = z.object({ ... });
export async function handler(params) { return { content: [...] }; }
```

All tools are registered in `src/index.ts` via `registerTool()` which wraps each handler in `safeHandler()`.

### Vault Path Resolution (priority order)

1. CLI argument: `node dist/index.js D:/vault`
2. Environment variable: `NOTES_VAULT_PATH`
3. `vault.config.json`: `{ "vaultPath": "D:/vault" }` (simplest — just edit the file)
4. `.env` file: `NOTES_VAULT_PATH=D:/vault`

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Soft delete | `.trash/` folder | Compatible with markdown editors, recoverable |
| File watching | Polling (mtime+size) | No external deps, exFAT-safe |
| Path security | `resolve()` + prefix check | Blocks traversal attacks |
| Trash exclusion | Skip `.trash` in list/search/graph | Trash contents don't pollute results |
| Watcher interval | Configurable via `NOTES_WATCH_INTERVAL` | Default 5000ms, adjustable |

### Project Structure

```
d:\quill-mcp\
├── src/
│   ├── index.ts                  # Entry point, server setup, tool registration
│   ├── tools/                    # One file per MCP tool (49 tools)
│   │   ├── read-note.ts
│   │   ├── write-note.ts
│   │   ├── create-note.ts
│   │   ├── append-note.ts
│   │   ├── delete-note.ts        # Soft delete (permanent=false) or hard delete
│   │   ├── delete-folder.ts      # Soft delete with recursive option
│   │   ├── batch-delete.ts       # Batch soft/permanent delete
│   │   ├── restore-note.ts       # Restore from .trash/
│   │   ├── list-trash.ts         # Browse .trash/ contents
│   │   ├── move-note.ts
│   │   ├── copy-note.ts
│   │   ├── list-notes.ts         # Excludes .trash/
│   │   ├── search-notes.ts       # Full-text + regex, excludes .trash/
│   │   ├── search-by-name.ts
│   │   ├── note-info.ts
│   │   ├── create-folder.ts
│   │   ├── rename-folder.ts
│   │   ├── extract-tags.ts
│   │   ├── extract-links.ts      # Wiki links [[...]] and markdown links
│   │   ├── extract-callouts.ts   # Obsidian callout parsing ([!type], foldable)
│   │   ├── find-backlinks.ts
│   │   ├── watch-changes.ts      # Returns detected external file changes
│   │   ├── session-history.ts    # View session mutation history
│   │   ├── create-template.ts    # daily, meeting, project, idea templates
│   │   ├── read-frontmatter.ts
│   │   ├── write-frontmatter.ts
│   │   ├── update-frontmatter.ts
│   │   ├── vault-status.ts
│   │   ├── batch-move.ts
│   │   ├── quill-write.ts        # Memory intelligence: write typed memory
│   │   ├── quill-record-decision.ts
│   │   ├── quill-record-lesson.ts
│   │   ├── quill-record-discovery.ts
│   │   ├── quill-retrieve.ts     # Smart BM25 retrieval
│   │   ├── quill-recall.ts       # Quick project recall
│   │   ├── quill-detect-conflicts.ts
│   │   ├── quill-resolve-conflict.ts
│   │   ├── quill-checkpoint.ts   # Context checkpoint
│   │   ├── quill-restore.ts      # Context restoration
│   │   ├── quill-consolidate.ts  # Memory consolidation
│   │   ├── quill-audit.ts        # Audit log query
│   │   ├── quill-session-start.ts
│   │   ├── quill-session-end.ts
│   │   ├── tools.test.ts         # Core tool test suite
│   │   ├── tools-full.test.ts    # Expanded test suite (49 cases)
│   │   └── stdio-integration.test.ts  # MCP stdio integration test
│   └── utils/
│       ├── vault.ts              # Vault root resolution, path safety, initVault()
│       ├── vault.test.ts
│       ├── trash.ts              # moveToTrash, restoreFromTrash, isInTrash, listTrash
│       ├── trash.test.ts         # Trash utility tests (10 cases)
│       ├── watcher.ts            # VaultWatcher singleton, polling based change detection
│       ├── graph.ts              # Graph engine: BFS, centrality, communities, orphans, bridges
│       ├── logger.ts             # Structured JSON logger
│       ├── links.ts              # Link extraction utilities (wiki + markdown)
│       ├── callouts.ts           # Obsidian callout parsing (13 types + aliases)
│       ├── session-tracker.ts    # Session mutation tracking
│       ├── tokens.ts             # Token estimation utilities
│       ├── frontmatter.ts        # YAML frontmatter parsing (enhanced: nested objects, multi-line arrays)
│       ├── memory-id.ts          # ULID generation (Crockford Base32, mem_ prefix)
│       ├── memory-id.test.ts
│       ├── memory-schema.ts      # Zod schemas, 16 memory types, 8 statuses, confidence
│       ├── memory-schema.test.ts
│       ├── lifecycle.ts          # State machine: valid transitions, resurrection prevention
│       ├── lifecycle.test.ts
│       ├── config.ts             # Config resolver (vault.config.json → env → defaults)
│       ├── audit-log.ts          # Append-only JSON audit trail
│       ├── metadata-index.ts     # In-memory cache, secondary indexes, BM25 inverted index
│       ├── retrieval-engine.ts   # BM25 scoring, composite ranking, context budget modes
│       ├── conflict-engine.ts    # Field-based conflict detection, resolution, supersession
│       ├── checkpoint.ts         # Checkpoint create/restore for context reconstruction
│       ├── consolidation.ts      # Jaccard duplicate detection, promotion, archival
│       └── consolidation.test.ts
├── dist/                         # Compiled JS output (gitignored)
├── assets/
│   └── logo.png                  # Quill logo
├── skills/
│   └── note-graph.md             # /note-graph skill definition
├── canvas/
│   └── note-graph.canvas.tsx     # Knowledge graph canvas visualization
├── .env.example                  # Environment variable documentation
├── .prettierrc                   # Code formatting config
├── .gitignore
├── tsconfig.json
├── package.json
├── LICENSE                       # MIT
├── README.md                     # This file
└── CONTRIBUTING.md
```

### Development Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Watch mode compilation
npm start              # Run the server (node dist/index.js)
npm test               # Run vitest
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier format
npm run format:check   # Prettier check
```

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NOTES_VAULT_PATH` | Path to the markdown vault | (required via CLI arg or .env) |
| `NOTES_WATCH_INTERVAL` | File watcher polling interval in ms | `5000` |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | `info` |

### Known Limitations

- **No chokidar:** File watcher uses custom polling to avoid adding dependencies. Inherent latency vs native fs events.
- **Single vault:** One vault per server instance. No multi-vault support.

---

## Features

- **Read** — read note contents by path
- **Write** — create or overwrite a note (auto-creates parent directories)
- **Create** — create a new note (fails if it already exists)
- **Append** — append content to an existing note
- **Soft Delete** — move notes to `.trash/` (recoverable) or permanently delete
- **Restore** — recover notes from `.trash/` back to their original location
- **Delete Folder** — remove a folder (soft or permanent)
- **Move / Rename** — move or rename notes within the vault
- **Copy** — copy a note to a new location
- **List** — list files and folders with pagination support
- **Search** — full-text search with regex support and pagination
- **Search by Name** — find notes by filename pattern
- **Note Info** — get metadata (size, created/modified dates) for any file or folder
- **Create Folder** — create directories in the vault
- **Rename Folder** — rename existing folders
- **Extract Tags** — extract hashtags from notes
- **Templates** — create notes from predefined templates (daily, meeting, project, idea)
- **Frontmatter** — read and write YAML frontmatter in notes
- **Batch Delete** — delete multiple notes at once (soft or permanent)
- **Batch Move** — move multiple notes at once
- **Knowledge Graph** — extract links, find backlinks, discover orphans
- **Extract Callouts** — parse Obsidian callout syntax from notes
- **Session History** — track vault mutations across sessions
- **File Watching** — detect external changes from other editors or tools
- **Trash Management** — list and restore items from the trash
- **Vault Status** — check if the vault is accessible and healthy

### Memory Intelligence Layer

quill-mcp includes a persistent memory intelligence layer that transforms the vault into an agent memory system:

- **16 Memory Types** — FACT, DECISION, CONSTRAINT, ARCHITECTURE, LESSON, DISCOVERY, ERROR, SOLUTION, and more
- **Lifecycle State Machine** — ACTIVE → CONFIRMED → ARCHIVED with transition validation and resurrection prevention
- **BM25 Smart Retrieval** — keyword-ranked retrieval with metadata boosting (project match, importance, recency, confidence)
- **Context Budget Modes** — compact (5 results), standard (20), deep (100) for token-aware retrieval
- **Conflict Detection** — field-based detection of contradictory same-entity memories within a project
- **Memory Consolidation** — Jaccard duplicate detection, importance promotion, obsolete archival
- **Checkpoints** — structured markdown checkpoints for context reconstruction after compaction
- **Audit Trail** — append-only JSON log of all memory mutations with rotation
- **Secret Detection** — automatic scanning for API keys, tokens, and passwords before writes
- **Project Isolation** — memories scoped by project with hard filtering
- **ULID Identifiers** — time-sortable unique IDs (mem_ prefix, Crockford Base32)
- **Zod Validation** — runtime schema validation for all memory frontmatter

## Security

- **Path traversal defense:** All paths are resolved relative to the configured vault root. Any attempt to access files outside the vault is rejected.
- **Symlink/junction defense:** Existing paths are verified via `realpath()` to prevent symlink escapes. Write destinations validate their deepest existing parent.
- **Vault root protection:** No tool can delete, move, or overwrite the vault root itself.
- **Protected directories:** Internal directories (`.trash`, `.git`, `.quill-sessions`, `node_modules`) cannot be targeted by delete/move/rename operations.
- **Stdio isolation:** All diagnostic logging goes to stderr. Stdout contains JSON-RPC only, ensuring clean MCP communication.
- **Crash protection:** Uncaught exceptions are logged and trigger a clean nonzero exit. Tool handler errors are caught and returned as MCP error responses.

## Setup

```bash
git clone https://github.com/Manolito016/quill-mcp.git
cd quill-mcp
npm install
npm run build
```

## Add to Your MCP Client

### Option 1: Using vault.config.json (simplest)

Edit `vault.config.json` in the project root and set your vault path:

```json
{
  "vaultPath": "D:/your/vault/path"
}
```

The default value is `"enter the path"` — replace it with your actual vault location.

If `vaultPath` is empty or still says `"enter the path"`, the server will auto-detect common vault locations (`D:/vault`, `~/Documents/vault`, etc.).

Then add the server to your MCP client config (no path in args needed):

```json
{
  "mcpServers": {
    "notes": {
      "command": "node",
      "args": ["d:/quill-mcp/dist/index.js"]
    }
  }
}
```

### Option 2: Using CLI argument

Add the server to your MCP client configuration and point it to your vault:

```json
{
  "mcpServers": {
    "notes": {
      "command": "node",
      "args": ["d:/quill-mcp/dist/index.js", "D:/vault"]
    }
  }
}
```

Replace `D:/vault` with the path to your notes folder. The AI agent will automatically start the server and use the tools.

## Configuration

The vault path is resolved from these sources (in priority order):

| Priority | Method | How |
|----------|--------|-----|
| 1 (highest) | CLI argument | `"args": ["...", "D:/vault"]` in MCP config |
| 2 | Environment variable | Set `NOTES_VAULT_PATH` in your system env |
| 3 | Config file | Edit `vault.config.json` → `{ "vaultPath": "D:/vault" }` |
| 4 (lowest) | `.env` file | Add `NOTES_VAULT_PATH=D:/vault` to the project `.env` |

The **config file** approach is the simplest — just edit `vault.config.json` and set your vault path. No env vars, no CLI args needed.

## Tools Reference

| Tool | Description | Parameters |
|------|-------------|------------|
| `read_note` | Read the content of a note | `path` — relative path in vault |
| `write_note` | Create or overwrite a note | `path`, `content` |
| `create_note` | Create a new note (fails if exists) | `path`, `content` |
| `append_note` | Append content to an existing note | `path`, `content` |
| `delete_note` | Move note to trash (recoverable) | `path`, `permanent` (default `false`) |
| `delete_folder` | Move folder to trash (recoverable) | `path`, `recursive` (default `true`), `permanent` (default `false`) |
| `move_note` | Move or rename a note | `from`, `to` |
| `copy_note` | Copy a note to a new location | `from`, `to` |
| `rename_folder` | Rename a folder | `from`, `to` |
| `list_notes` | List files in a directory | `path` (default `.`), `recursive` (default `false`), `limit`, `offset` |
| `search_notes` | Full-text search with regex support | `query`, `path` (default `.`), `fileExtension` (default `.md`), `useRegex` (default `false`), `limit`, `offset`, `showTokenEstimate` (default `false`) |
| `search_by_name` | Search by filename pattern | `pattern`, `path` (default `.`), `recursive` (default `true`) |
| `discover` | Ranked filename/path/metadata/heading/content discovery | `query`, `folder`, `limit`, `cursor`, `types`, `search_fields` |
| `search_files` | Indexed filename/path substring or glob search | `pattern`, `folder`, `match`, `recursive`, `include_path_matches`, `limit`, `cursor` |
| `search_by_tag` | YAML tag discovery with AND/OR matching | `tags`, `operator`, `folder`, `limit`, `cursor` |
| `list_folder` | Bounded folder browsing with concise metadata | `folder`, `recursive`, `include_metadata`, `limit`, `cursor` |
| `refresh_knowledge_index` | Explicitly rebuild the discovery catalog | none |
| `extract_tags` | Extract hashtags from a note | `path` |
| `read_frontmatter` | Read YAML frontmatter from a note | `path` |
| `write_frontmatter` | Write YAML frontmatter to a note (replaces all) | `path`, `frontmatter` (object) |
| `update_frontmatter` | Update specific frontmatter keys (preserves others) | `path`, `updates` (object) |
| `create_from_template` | Create note from template | `path`, `template` (daily/meeting/project/idea), `title` |
| `note_info` | Get file/folder metadata | `path` |
| `create_folder` | Create a new folder | `path` |
| `batch_delete` | Delete multiple notes (soft or permanent) | `paths` (array), `permanent` (default `false`) |
| `batch_move` | Move multiple notes at once | `moves` (array of `{from, to}`) |
| `vault_status` | Check vault health and accessibility | (none) |
| `extract_links` | Extract wiki and markdown links from a note | `path` |
| `find_backlinks` | Find all notes linking to a target note | `path` (note name without .md), `searchPath` (default `.`) |

| `restore_note` | Restore a note from trash to original location | `path` (path inside .trash/) |
| `list_trash` | List all items in the trash | (none) |
| `watch_changes` | Check for external file changes since last poll | `clear` (default `true`) |

| `session_history` | View session mutation history | `limit` (default `10`), `sessionId` (optional) |
| `extract_callouts` | Extract Obsidian callouts from a note | `path` |
| `quill_write` | Write a typed memory with frontmatter metadata | `path`, `content`, `type`, `project`, `confidence`, `importance`, `entity`, `source_type`, `source_reference`, `tags`, `related`, `supersedes`, `allow_secrets` |
| `quill_record_decision` | Record a decision memory | `project`, `content`, `entity`, `source_type`, `source_reference`, `confidence`, `importance`, `tags` |
| `quill_record_lesson` | Record a lesson learned | `project`, `content`, `entity`, `source_type`, `source_reference`, `confidence`, `importance`, `tags` |
| `quill_record_discovery` | Record a discovery memory | `project`, `content`, `entity`, `source_type` (required), `source_reference`, `confidence`, `importance`, `tags` |
| `quill_retrieve` | Smart retrieval with BM25 ranking | `query`, `project`, `mode` (compact/standard/deep), `type`, `tags`, `limit` |
| `quill_recall` | Quick recall of top project memories | `project`, `limit` (default 10) |
| `quill_detect_conflicts` | Detect contradictory memories | `project`, `type` |
| `quill_resolve_conflict` | Resolve a conflict between memories | `memory_id_a`, `memory_id_b`, `action` (supersede/reject/manual_review), `keeper`, `reason`. Also supports `batch` mode for auto-resolving all conflicts. |
| `quill_checkpoint` | Create a context checkpoint | `project`, `label`, `objective`, `current_state`, `known_problems`, `next_actions` |
| `quill_restore` | Restore context from checkpoint | `project`, `mode` (compact/standard/deep), `label` |
| `quill_consolidate` | Consolidate memories (merge/promote/archive) | `project`, `action` (merge_duplicates/promote_important/archive_obsolete), `confirm` |
| `quill_audit` | Query the memory audit log | `memory_id`, `action`, `from`, `to`, `limit` (default 50) |
| `quill_session_start` | Start a memory-aware session | `project`, `objective` |
| `quill_session_end` | End the current session | `summary`, `next_actions` |

## Tech Stack

- **TypeScript** — type-safe implementation
- **@modelcontextprotocol/sdk** — MCP server SDK
- **Zod** — runtime input validation
- **dotenv** — `.env` file configuration support
- **vitest** — test framework (v4)
- **ESLint + Prettier** — linting and formatting

## License

MIT
