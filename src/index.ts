#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initVault, getVaultRoot } from "./utils/vault.js";
import { logger } from "./utils/logger.js";

import * as readNote from "./tools/read-note.js";
import * as writeNote from "./tools/write-note.js";
import * as createNote from "./tools/create-note.js";
import * as deleteNote from "./tools/delete-note.js";
import * as moveNote from "./tools/move-note.js";
import * as listNotes from "./tools/list-notes.js";
import * as searchNotes from "./tools/search-notes.js";
import * as noteInfo from "./tools/note-info.js";
import * as createFolder from "./tools/create-folder.js";
import * as appendNote from "./tools/append-note.js";
import * as deleteFolder from "./tools/delete-folder.js";
import * as copyNote from "./tools/copy-note.js";
import * as vaultStatus from "./tools/vault-status.js";
import * as batchDelete from "./tools/batch-delete.js";
import * as batchMove from "./tools/batch-move.js";
import * as renameFolder from "./tools/rename-folder.js";
import * as extractTags from "./tools/extract-tags.js";
import * as searchByName from "./tools/search-by-name.js";
import * as createTemplate from "./tools/create-template.js";
import * as readFrontmatter from "./tools/read-frontmatter.js";
import * as writeFrontmatter from "./tools/write-frontmatter.js";
import * as updateFrontmatter from "./tools/update-frontmatter.js";

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

server.registerTool(
    appendNote.name,
    { description: appendNote.description, inputSchema: appendNote.inputSchema },
    appendNote.handler,
);

server.registerTool(
    deleteFolder.name,
    { description: deleteFolder.description, inputSchema: deleteFolder.inputSchema },
    deleteFolder.handler,
);

server.registerTool(
    copyNote.name,
    { description: copyNote.description, inputSchema: copyNote.inputSchema },
    copyNote.handler,
);

server.registerTool(
    vaultStatus.name,
    { description: vaultStatus.description, inputSchema: vaultStatus.inputSchema },
    vaultStatus.handler,
);

server.registerTool(
    batchDelete.name,
    { description: batchDelete.description, inputSchema: batchDelete.inputSchema },
    batchDelete.handler,
);

server.registerTool(
    batchMove.name,
    { description: batchMove.description, inputSchema: batchMove.inputSchema },
    batchMove.handler,
);

server.registerTool(
    renameFolder.name,
    { description: renameFolder.description, inputSchema: renameFolder.inputSchema },
    renameFolder.handler,
);

server.registerTool(
    extractTags.name,
    { description: extractTags.description, inputSchema: extractTags.inputSchema },
    extractTags.handler,
);

server.registerTool(
    searchByName.name,
    { description: searchByName.description, inputSchema: searchByName.inputSchema },
    searchByName.handler,
);

server.registerTool(
    createTemplate.name,
    { description: createTemplate.description, inputSchema: createTemplate.inputSchema },
    createTemplate.handler,
);

server.registerTool(
    readFrontmatter.name,
    { description: readFrontmatter.description, inputSchema: readFrontmatter.inputSchema },
    readFrontmatter.handler,
);

server.registerTool(
    writeFrontmatter.name,
    { description: writeFrontmatter.description, inputSchema: writeFrontmatter.inputSchema },
    writeFrontmatter.handler,
);

server.registerTool(
    updateFrontmatter.name,
    { description: updateFrontmatter.description, inputSchema: updateFrontmatter.inputSchema },
    updateFrontmatter.handler,
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info(`notes-mcp server running`, { vault: vaultPath, tools: 22 });

    process.on("SIGINT", () => {
        logger.info("Received SIGINT, shutting down gracefully");
        process.exit(0);
    });

    process.on("SIGTERM", () => {
        logger.info("Received SIGTERM, shutting down gracefully");
        process.exit(0);
    });
}

main().catch((err) => {
    logger.error("Fatal error", { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
});
