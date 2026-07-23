# notes-mcp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for managing a markdown notes vault. Gives AI assistants the ability to create, read, update, delete, move, search, and organize markdown notes on the local filesystem.

## Features

- **Read** — read note contents by path
- **Write** — create or overwrite a note (auto-creates parent directories)
- **Create** — create a new note (fails if it already exists)
- **Delete** — remove a note
- **Move / Rename** — move or rename notes within the vault
- **List** — list files and folders, with optional recursive mode
- **Search** — full-text case-insensitive search across notes
- **Note Info** — get metadata (size, created/modified dates) for any file or folder
- **Create Folder** — create directories in the vault

## Security

All paths are resolved relative to the configured vault root. Path traversal attacks are blocked — any attempt to access files outside the vault will be rejected.

## Requirements

- Node.js 18+
- A directory to use as the vault

## Installation

```bash
git clone https://github.com/Manolito016/note-mcp.git
cd note-mcp
npm install
npm run build
```

## Configuration

The vault path can be configured in three ways, evaluated in this priority order:

| Priority | Method | Example |
|----------|--------|---------|
| 1 (highest) | CLI argument | `node dist/index.js D:/vault` |
| 2 | Environment variable | `NOTES_VAULT_PATH=D:/vault` |
| 3 (lowest) | `.env` file | `NOTES_VAULT_PATH=D:/vault` in project root |

### Option 1: CLI Argument

Pass the vault path directly when starting the server:

```bash
node dist/index.js D:/vault
```

### Option 2: Environment Variable

Set `NOTES_VAULT_PATH` in your system environment:

```powershell
# Windows (PowerShell)
$env:NOTES_VAULT_PATH = "D:\vault"
node dist/index.js
```

```bash
# Linux / macOS
export NOTES_VAULT_PATH=/path/to/vault
node dist/index.js
```

### Option 3: `.env` File

Copy `.env.example` to `.env` and set your vault path:

```bash
cp .env.example .env
```

```env
# .env
NOTES_VAULT_PATH=D:/vault
```

This is the most convenient option — set it once and forget about it.

## Usage

The server communicates over **stdio**. Once configured, start it with:

```bash
npm start          # uses .env file or environment variable
npm start -- D:/vault   # CLI argument overrides other methods
```

### MCP Client Configuration

Add the server to your MCP client config (e.g. Claude Desktop, Qoder, etc.):

**With CLI argument (explicit vault path):**

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

**With environment variable (vault path in `.env` file):**

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

The server will read the vault path from the `.env` file automatically.

## Tools Reference

| Tool | Description | Parameters |
|------|-------------|------------|
| `read_note` | Read the content of a note | `path` — relative path in vault |
| `write_note` | Create or overwrite a note | `path`, `content` |
| `create_note` | Create a new note (fails if exists) | `path`, `content` |
| `delete_note` | Delete a note | `path` |
| `move_note` | Move or rename a note | `from`, `to` |
| `list_notes` | List files in a directory | `path` (default `.`), `recursive` (default `false`) |
| `search_notes` | Full-text search across notes | `query`, `path` (default `.`), `fileExtension` (default `.md`) |
| `note_info` | Get file/folder metadata | `path` |
| `create_folder` | Create a new folder | `path` |

## Tech Stack

- **TypeScript** — type-safe implementation
- **@modelcontextprotocol/sdk** — MCP server SDK
- **Zod** — runtime input validation
- **dotenv** — `.env` file configuration support

## License

MIT
