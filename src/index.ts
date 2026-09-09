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
import * as restoreNote from "./tools/restore-note.js";
import * as listTrash from "./tools/list-trash.js";
import * as watchChanges from "./tools/watch-changes.js";
import * as sessionHistory from "./tools/session-history.js";
import * as extractCallouts from "./tools/extract-callouts.js";
import * as quillWrite from "./tools/quill-write.js";
import * as quillRecordDecision from "./tools/quill-record-decision.js";
import * as quillRecordLesson from "./tools/quill-record-lesson.js";
import * as quillRecordDiscovery from "./tools/quill-record-discovery.js";
import * as quillRetrieve from "./tools/quill-retrieve.js";
import * as quillRecall from "./tools/quill-recall.js";
import * as quillDetectConflicts from "./tools/quill-detect-conflicts.js";
import * as quillResolveConflict from "./tools/quill-resolve-conflict.js";
import * as quillCheckpoint from "./tools/quill-checkpoint.js";
import * as quillRestore from "./tools/quill-restore.js";
import * as quillConsolidate from "./tools/quill-consolidate.js";
import * as quillAudit from "./tools/quill-audit.js";
import * as quillSessionStart from "./tools/quill-session-start.js";
import * as quillSessionEnd from "./tools/quill-session-end.js";
import * as generateHiveCanvas from "./tools/generate-hive-canvas.js";
import * as discover from "./tools/discover.js";
import * as searchFiles from "./tools/search-files.js";
import * as searchByTag from "./tools/search-by-tag.js";
import * as listFolder from "./tools/list-folder.js";
import * as refreshKnowledgeIndex from "./tools/refresh-knowledge-index.js";
import { vaultWatcher } from "./utils/watcher.js";
import { classifyError } from "./utils/errors.js";
import { checkRateLimit, startRateLimiterCleanup, stopRateLimiterCleanup } from "./utils/rate-limiter.js";

// --- Crash protection (registered before anything else) ---
process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception — shutting down", { error: err.message, stack: err.stack });
    // Give the logger time to flush, then exit nonzero
    setTimeout(() => process.exit(1), 100);
});

process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason: reason instanceof Error ? reason.message : String(reason) });
});

// --- Safe handler wrapper ---
// Prevents any tool handler from crashing the server process.
// Catches unexpected errors and returns them as MCP error responses
// with structured error data for programmatic client handling.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (...args: any[]) => any;

function safeHandler<H extends AnyHandler>(name: string, handler: H): H {
    const wrapped = async (...args: Parameters<H>) => {
        // Check rate limit before executing handler
        const rateLimitError = checkRateLimit(name);
        if (rateLimitError) {
            return {
                content: [{ type: "text" as const, text: rateLimitError }],
                isError: true,
            };
        }

        try {
            return await handler(...args);
        } catch (err) {
            const classified = classifyError(err);
            logger.error(`Tool "${name}" failed`, { error: classified.message, code: classified.code });
            // Return structured error data as JSON for programmatic client handling
            const errorData = JSON.stringify(classified.data, null, 2);
            return {
                content: [
                    { type: "text" as const, text: `Error in ${name}: ${classified.message}` },
                    { type: "text" as const, text: `Error details:\n${errorData}` },
                ],
                isError: true,
            };
        }
    };
    return wrapped as H;
}

// --- Vault initialization ---
const vaultPath = initVault();

const server = new McpServer({
    name: "quill-mcp",
    version: "1.0.0",
});

// --- Safe tool registration helper ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function registerTool(name: string, description: string, inputSchema: z.ZodObject<any>, handler: AnyHandler) {
    server.registerTool(name, { description, inputSchema }, safeHandler(name, handler));
    toolCount++;
}

let toolCount = 0;

// --- Register all tools ---
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
registerTool(
    writeFrontmatter.name,
    writeFrontmatter.description,
    writeFrontmatter.inputSchema,
    writeFrontmatter.handler,
);
registerTool(
    updateFrontmatter.name,
    updateFrontmatter.description,
    updateFrontmatter.inputSchema,
    updateFrontmatter.handler,
);
registerTool(extractLinks.name, extractLinks.description, extractLinks.inputSchema, extractLinks.handler);
registerTool(findBacklinks.name, findBacklinks.description, findBacklinks.inputSchema, findBacklinks.handler);
registerTool(restoreNote.name, restoreNote.description, restoreNote.inputSchema, restoreNote.handler);
registerTool(listTrash.name, listTrash.description, listTrash.inputSchema, listTrash.handler);
registerTool(watchChanges.name, watchChanges.description, watchChanges.inputSchema, watchChanges.handler);
registerTool(sessionHistory.name, sessionHistory.description, sessionHistory.inputSchema, sessionHistory.handler);
registerTool(extractCallouts.name, extractCallouts.description, extractCallouts.inputSchema, extractCallouts.handler);

// --- Memory Intelligence Tools ---
registerTool(quillWrite.name, quillWrite.description, quillWrite.inputSchema, quillWrite.handler);
registerTool(
    quillRecordDecision.name,
    quillRecordDecision.description,
    quillRecordDecision.inputSchema,
    quillRecordDecision.handler,
);
registerTool(
    quillRecordLesson.name,
    quillRecordLesson.description,
    quillRecordLesson.inputSchema,
    quillRecordLesson.handler,
);
registerTool(
    quillRecordDiscovery.name,
    quillRecordDiscovery.description,
    quillRecordDiscovery.inputSchema,
    quillRecordDiscovery.handler,
);
registerTool(quillRetrieve.name, quillRetrieve.description, quillRetrieve.inputSchema, quillRetrieve.handler);
registerTool(quillRecall.name, quillRecall.description, quillRecall.inputSchema, quillRecall.handler);
registerTool(
    quillDetectConflicts.name,
    quillDetectConflicts.description,
    quillDetectConflicts.inputSchema,
    quillDetectConflicts.handler,
);
registerTool(
    quillResolveConflict.name,
    quillResolveConflict.description,
    quillResolveConflict.inputSchema,
    quillResolveConflict.handler,
);
registerTool(quillCheckpoint.name, quillCheckpoint.description, quillCheckpoint.inputSchema, quillCheckpoint.handler);
registerTool(quillRestore.name, quillRestore.description, quillRestore.inputSchema, quillRestore.handler);
registerTool(
    quillConsolidate.name,
    quillConsolidate.description,
    quillConsolidate.inputSchema,
    quillConsolidate.handler,
);
registerTool(quillAudit.name, quillAudit.description, quillAudit.inputSchema, quillAudit.handler);
registerTool(
    quillSessionStart.name,
    quillSessionStart.description,
    quillSessionStart.inputSchema,
    quillSessionStart.handler,
);
registerTool(quillSessionEnd.name, quillSessionEnd.description, quillSessionEnd.inputSchema, quillSessionEnd.handler);

// --- Hive Canvas Generation ---
registerTool(
    generateHiveCanvas.name,
    generateHiveCanvas.description,
    generateHiveCanvas.inputSchema,
    generateHiveCanvas.handler,
);

// --- Unified Knowledge Discovery ---
registerTool(discover.name, discover.description, discover.inputSchema, discover.handler);
registerTool(searchFiles.name, searchFiles.description, searchFiles.inputSchema, searchFiles.handler);
registerTool(searchByTag.name, searchByTag.description, searchByTag.inputSchema, searchByTag.handler);
registerTool(listFolder.name, listFolder.description, listFolder.inputSchema, listFolder.handler);
registerTool(
    refreshKnowledgeIndex.name,
    refreshKnowledgeIndex.description,
    refreshKnowledgeIndex.inputSchema,
    refreshKnowledgeIndex.handler,
);

// --- Main ---
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info(`quill-mcp server running`, { vault: vaultPath, tools: toolCount });

    // Initialize file watcher for external change detection
    await vaultWatcher.initialize();
    vaultWatcher.start();

    // Start rate limiter cleanup interval
    startRateLimiterCleanup();

    // Keepalive: periodic heartbeat to prevent idle pipe timeouts
    const keepaliveInterval = setInterval(() => {
        logger.debug("keepalive heartbeat");
    }, 60_000); // every 60 seconds

    process.on("SIGINT", () => {
        clearInterval(keepaliveInterval);
        vaultWatcher.stop();
        stopRateLimiterCleanup();
        logger.info("Received SIGINT, shutting down gracefully");
        process.exit(0);
    });

    process.on("SIGTERM", () => {
        clearInterval(keepaliveInterval);
        vaultWatcher.stop();
        stopRateLimiterCleanup();
        logger.info("Received SIGTERM, shutting down gracefully");
        process.exit(0);
    });
}

main().catch((err) => {
    logger.error("Fatal error during startup", { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
});
