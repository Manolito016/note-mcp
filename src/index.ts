#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initVault } from "./utils/vault.js";
import { logger } from "./utils/logger.js";
import type * as z from "zod";

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
import * as extractLinks from "./tools/extract-links.js";
import * as findBacklinks from "./tools/find-backlinks.js";
import * as getGraph from "./tools/get-graph.js";
import * as restoreNote from "./tools/restore-note.js";
import * as listTrash from "./tools/list-trash.js";
import * as watchChanges from "./tools/watch-changes.js";
import { vaultWatcher } from "./utils/watcher.js";

// --- Crash protection (registered before anything else) ---
process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", { error: err.message, stack: err.stack });
});

process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason: reason instanceof Error ? reason.message : String(reason) });
});

// --- Safe handler wrapper ---
// Prevents any tool handler from crashing the server process.
// Catches unexpected errors and returns them as MCP error responses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (...args: any[]) => any;

function safeHandler<H extends AnyHandler>(name: string, handler: H): H {
    const wrapped = async (...args: Parameters<H>) => {
        try {
            return await handler(...args);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(`Tool "${name}" failed`, { error: message });
            return {
                content: [{ type: "text" as const, text: `Error in ${name}: ${message}` }],
                isError: true,
            };
        }
    };
    return wrapped as H;
}

// --- Vault initialization ---
const vaultPath = initVault();

const server = new McpServer({
    name: "notes-mcp",
    version: "1.0.0",
});

// --- Safe tool registration helper ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function registerTool(name: string, description: string, inputSchema: z.ZodObject<any>, handler: AnyHandler) {
    server.registerTool(name, { description, inputSchema }, safeHandler(name, handler));
}

// --- Register all 28 tools ---
registerTool(readNote.name, readNote.description, readNote.inputSchema, readNote.handler);
registerTool(writeNote.name, writeNote.description, writeNote.inputSchema, writeNote.handler);
registerTool(createNote.name, createNote.description, createNote.inputSchema, createNote.handler);
registerTool(deleteNote.name, deleteNote.description, deleteNote.inputSchema, deleteNote.handler);
registerTool(moveNote.name, moveNote.description, moveNote.inputSchema, moveNote.handler);
registerTool(listNotes.name, listNotes.description, listNotes.inputSchema, listNotes.handler);
registerTool(searchNotes.name, searchNotes.description, searchNotes.inputSchema, searchNotes.handler);
registerTool(noteInfo.name, noteInfo.description, noteInfo.inputSchema, noteInfo.handler);
registerTool(createFolder.name, createFolder.description, createFolder.inputSchema, createFolder.handler);
registerTool(appendNote.name, appendNote.description, appendNote.inputSchema, appendNote.handler);
registerTool(deleteFolder.name, deleteFolder.description, deleteFolder.inputSchema, deleteFolder.handler);
registerTool(copyNote.name, copyNote.description, copyNote.inputSchema, copyNote.handler);
registerTool(vaultStatus.name, vaultStatus.description, vaultStatus.inputSchema, vaultStatus.handler);
registerTool(batchDelete.name, batchDelete.description, batchDelete.inputSchema, batchDelete.handler);
registerTool(batchMove.name, batchMove.description, batchMove.inputSchema, batchMove.handler);
registerTool(renameFolder.name, renameFolder.description, renameFolder.inputSchema, renameFolder.handler);
registerTool(extractTags.name, extractTags.description, extractTags.inputSchema, extractTags.handler);
registerTool(searchByName.name, searchByName.description, searchByName.inputSchema, searchByName.handler);
registerTool(createTemplate.name, createTemplate.description, createTemplate.inputSchema, createTemplate.handler);
registerTool(readFrontmatter.name, readFrontmatter.description, readFrontmatter.inputSchema, readFrontmatter.handler);
registerTool(writeFrontmatter.name, writeFrontmatter.description, writeFrontmatter.inputSchema, writeFrontmatter.handler);
registerTool(updateFrontmatter.name, updateFrontmatter.description, updateFrontmatter.inputSchema, updateFrontmatter.handler);
registerTool(extractLinks.name, extractLinks.description, extractLinks.inputSchema, extractLinks.handler);
registerTool(findBacklinks.name, findBacklinks.description, findBacklinks.inputSchema, findBacklinks.handler);
registerTool(getGraph.name, getGraph.description, getGraph.inputSchema, getGraph.handler);
registerTool(restoreNote.name, restoreNote.description, restoreNote.inputSchema, restoreNote.handler);
registerTool(listTrash.name, listTrash.description, listTrash.inputSchema, listTrash.handler);
registerTool(watchChanges.name, watchChanges.description, watchChanges.inputSchema, watchChanges.handler);

// --- Main ---
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info(`notes-mcp server running`, { vault: vaultPath, tools: 28 });

    // Initialize file watcher for external change detection
    await vaultWatcher.initialize();
    vaultWatcher.start();

    // Keepalive: periodic heartbeat to prevent idle pipe timeouts
    const keepaliveInterval = setInterval(() => {
        logger.debug("keepalive heartbeat");
    }, 60_000); // every 60 seconds

    process.on("SIGINT", () => {
        clearInterval(keepaliveInterval);
        vaultWatcher.stop();
        logger.info("Received SIGINT, shutting down gracefully");
        process.exit(0);
    });

    process.on("SIGTERM", () => {
        clearInterval(keepaliveInterval);
        vaultWatcher.stop();
        logger.info("Received SIGTERM, shutting down gracefully");
        process.exit(0);
    });
}

main().catch((err) => {
    logger.error("Fatal error during startup", { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
});
