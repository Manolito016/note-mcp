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

## Setup

```bash
git clone https://github.com/Manolito016/note-mcp.git
cd note-mcp
npm install
npm run build
```

## Add to Your MCP Client

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

Alternatively, use a `.env` file so you don't need the path in args (see [Configuration](#configuration)):

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

## Configuration

The vault path is resolved from these sources (in priority order):

| Priority | Method | How |
|----------|--------|-----|
| 1 (highest) | CLI argument | `"args": ["...", "D:/vault"]` in MCP config |
| 2 | Environment variable | Set `NOTES_VAULT_PATH` in your system env |
| 3 (lowest) | `.env` file | Add `NOTES_VAULT_PATH=D:/vault` to the project `.env` |

The `.env` approach is the most convenient — set it once and it works for any MCP client config without repeating the path.

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
