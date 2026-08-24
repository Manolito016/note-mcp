<p align="center">
  <img src="assets/logo.png" alt="quill-mcp" width="200" />
</p>

# quill-mcp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for managing a markdown notes vault. Gives AI assistants the ability to create, read, update, delete, move, search, and organize markdown notes on the local filesystem.

---

## Project Context

> This section exists so an AI agent can restore full project context after a context window reset.

### What This Is

quill-mcp is a **stdio-based MCP server** written in TypeScript. It runs as a child process started by an MCP client (Qoder, Claude Desktop, etc.) and exposes **28 tools** for managing a local markdown vault. It is NOT a standalone app — it is always launched and managed by the host MCP client.

### GitHub

- **Repo:** https://github.com/Lito016/snapcheck
- **License:** MIT

### Runtime Environment

- **Node.js:** v22 LTS required (v24 has a silent crash bug on Windows — do NOT use)
- **Node path:** `C:\Users\Admin\node-v22\node-v22.22.1-win-x64\node.exe`
- **Project location:** `D:\notes-mcp`
- **Vault location:** `D:\vault` (configurable)
- **Filesystem:** exFAT (USB drive) — native `.node` bindings fail here, so vitest v4 cannot execute tests on this drive. Tests compile but must be validated on NTFS or CI.

### Architecture

```
Client (Qoder/Claude) ←stdio→ index.ts → tool handlers → vault filesystem
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
| Soft delete | `.trash/` folder | Obsidian-compatible, recoverable |
| File watching | Polling (mtime+size) | No external deps, exFAT-safe |
| Path security | `resolve()` + prefix check | Blocks traversal attacks |
| Trash exclusion | Skip `.trash` in list/search/graph | Trash contents don't pollute results |
| Watcher interval | Configurable via `NOTES_WATCH_INTERVAL` | Default 5000ms, adjustable |

### Project Structure

```
d:\notes-mcp\
├── src/
│   ├── index.ts                  # Entry point, server setup, tool registration
│   ├── tools/                    # One file per MCP tool (28 tools)
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
│   │   ├── find-backlinks.ts
│   │   ├── get-graph.ts          # Full knowledge graph (nodes+edges+tags), excludes .trash/
│   │   ├── watch-changes.ts      # Returns detected external file changes
│   │   ├── create-template.ts    # daily, meeting, project, idea templates
│   │   ├── read-frontmatter.ts
│   │   ├── write-frontmatter.ts
│   │   ├── update-frontmatter.ts
│   │   ├── vault-status.ts
│   │   ├── batch-move.ts
│   │   ├── tools.test.ts         # Original test suite
│   │   └── tools-full.test.ts    # Expanded test suite (25+ cases)
│   └── utils/
│       ├── vault.ts              # Vault root resolution, path safety, initVault()
│       ├── vault.test.ts
│       ├── trash.ts              # moveToTrash, restoreFromTrash, isInTrash, listTrash
│       ├── trash.test.ts         # Trash utility tests (10 cases)
│       ├── watcher.ts            # VaultWatcher singleton, polling-based change detection
│       ├── logger.ts             # Structured JSON logger
│       ├── links.ts              # Link extraction utilities (wiki + markdown)
│       └── frontmatter.ts        # YAML frontmatter parsing
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
npm test               # Run vitest (fails on exFAT — use NTFS or CI)
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

- **vitest v4 on exFAT:** Native binding (`rolldown`) fails to load on exFAT filesystems. Tests compile with `tsc` but cannot execute. Run on NTFS or CI.
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
- **Knowledge Graph** — extract links, find backlinks, build full graph with nodes and edges
- **File Watching** — detect external changes from Obsidian, VS Code, or other editors
- **Trash Management** — list and restore items from the trash
- **Vault Status** — check if the vault is accessible and healthy

## Security

All paths are resolved relative to the configured vault root. Path traversal attacks are blocked — any attempt to access files outside the vault will be rejected.

## Setup

```bash
git clone https://github.com/Lito016/snapcheck.git
cd snapcheck
npm install
npm run build
```

## Add to Your MCP Client

### Option 1: Using vault.config.json (simplest)

Edit `vault.config.json` in the project root and set your vault path:

```json
{
  "vaultPath": "D:/vault"
}
```

If `vaultPath` is empty, the server will auto-detect common vault locations (Obsidian folders, `D:/vault`, etc.).

Then add the server to your MCP client config (no path in args needed):

```json
{
  "mcpServers": {
    "notes": {
      "command": "node",
      "args": ["d:/notes-mcp/dist/index.js"]
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
      "args": ["d:/notes-mcp/dist/index.js", "D:/vault"]
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
| `search_notes` | Full-text search with regex support | `query`, `path` (default `.`), `fileExtension` (default `.md`), `useRegex` (default `false`), `limit`, `offset` |
| `search_by_name` | Search by filename pattern | `pattern`, `path` (default `.`), `recursive` (default `true`) |
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
| `find_backlinks` | Find all notes linking to a target note | `target`, `path` (default `.`) |
| `get_graph` | Build full knowledge graph (nodes + edges + tags) | `path` (default `.`), `includeTags` (default `true`) |
| `restore_note` | Restore a note from trash to original location | `path` (path inside .trash/) |
| `list_trash` | List all items in the trash | (none) |
| `watch_changes` | Check for external file changes since last poll | `clear` (default `true`) |

## Tech Stack

- **TypeScript** — type-safe implementation
- **@modelcontextprotocol/sdk** — MCP server SDK
- **Zod** — runtime input validation
- **dotenv** — `.env` file configuration support
- **vitest** — test framework (v4)
- **ESLint + Prettier** — linting and formatting

## License

MIT
