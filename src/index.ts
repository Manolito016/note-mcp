import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initVault, getVaultRoot } from "./utils/vault.js";

import * as readNote from "./tools/read-note.js";
import * as writeNote from "./tools/write-note.js";
import * as createNote from "./tools/create-note.js";
import * as deleteNote from "./tools/delete-note.js";
import * as moveNote from "./tools/move-note.js";
import * as listNotes from "./tools/list-notes.js";
import * as searchNotes from "./tools/search-notes.js";
import * as noteInfo from "./tools/note-info.js";
import * as createFolder from "./tools/create-folder.js";

const vaultPath = initVault();

const server = new McpServer({
    name: "notes-mcp",
    version: "1.0.0",
});

// Register all tools
server.registerTool(
    readNote.name,
    { description: readNote.description, inputSchema: readNote.inputSchema },
    readNote.handler,
);

server.registerTool(
    writeNote.name,
    { description: writeNote.description, inputSchema: writeNote.inputSchema },
    writeNote.handler,
);

server.registerTool(
    createNote.name,
    { description: createNote.description, inputSchema: createNote.inputSchema },
    createNote.handler,
);

server.registerTool(
    deleteNote.name,
    { description: deleteNote.description, inputSchema: deleteNote.inputSchema },
    deleteNote.handler,
);

server.registerTool(
    moveNote.name,
    { description: moveNote.description, inputSchema: moveNote.inputSchema },
    moveNote.handler,
);

server.registerTool(
    listNotes.name,
    { description: listNotes.description, inputSchema: listNotes.inputSchema },
    listNotes.handler,
);

server.registerTool(
    searchNotes.name,
    { description: searchNotes.description, inputSchema: searchNotes.inputSchema },
    searchNotes.handler,
);

server.registerTool(
    noteInfo.name,
    { description: noteInfo.description, inputSchema: noteInfo.inputSchema },
    noteInfo.handler,
);

server.registerTool(
    createFolder.name,
    { description: createFolder.description, inputSchema: createFolder.inputSchema },
    createFolder.handler,
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`notes-mcp server running — vault: ${vaultPath}`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
