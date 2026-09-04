/**
 * MCP stdio integration test.
 *
 * Starts the compiled server as a child process, sends JSON-RPC via stdin,
 * and verifies that stdout contains ONLY valid JSON-RPC responses (no stray
 * logging output). Also verifies representative read/write tool invocations.
 *
 * Run via: npm run test:integration
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

const TEST_VAULT = join(process.cwd(), "test-vault-temp-stdio");
let child: ChildProcess | null = null;
let stdoutBuffer = "";
let stderrBuffer = "";

/** Send a JSON-RPC message to the child process via stdin. */
function sendJsonRpc(msg: object): void {
    expect(child, "child process must be running").not.toBeNull();
    child!.stdin!.write(JSON.stringify(msg) + "\n");
}

/** Wait for a JSON-RPC response with the given id. */
function waitForResponse(id: number, timeoutMs = 15000): Promise<object> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Timeout waiting for response id=${id}. Stdout so far: ${stdoutBuffer.slice(0, 500)}`));
        }, timeoutMs);

        const check = () => {
            const lines = stdoutBuffer.split("\n").filter(Boolean);
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.id === id) {
                        clearTimeout(timer);
                        resolve(parsed);
                        return;
                    }
                } catch {
                    // Not valid JSON — will be checked later
                }
            }
            setTimeout(check, 50);
        };
        check();
    });
}

/** Verify every line in stdout is valid JSON-RPC. */
function assertAllStdoutIsJsonRpc(): void {
    const lines = stdoutBuffer.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
        const parsed = JSON.parse(line); // Throws if not valid JSON
        expect(parsed).toHaveProperty("jsonrpc", "2.0");
    }
    expect(lines.length).toBeGreaterThan(0);
}

describe("MCP stdio integration", () => {
    beforeAll(async () => {
        // Create test vault
        await mkdir(TEST_VAULT, { recursive: true });
        await mkdir(join(TEST_VAULT, "notes"), { recursive: true });
        await writeFile(join(TEST_VAULT, "notes", "hello.md"), "# Hello\n\nWorld");

        // Start the server (must be pre-built via `npm run build` or `npm run test:integration`)
        child = spawn("node", ["dist/index.js", TEST_VAULT], {
            cwd: process.cwd(),
            stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env, NOTES_VAULT_PATH: TEST_VAULT },
        });

        // Collect stdout — monitor for entire process lifetime
        child.stdout!.on("data", (chunk: Buffer) => {
            stdoutBuffer += chunk.toString();
        });

        // Collect stderr for diagnostics
        child.stderr!.on("data", (chunk: Buffer) => {
            stderrBuffer += chunk.toString();
        });

        // Wait for server to initialize
        await new Promise((resolve) => setTimeout(resolve, 1500));
    }, 30000);

    afterAll(async () => {
        if (child) {
            child.kill("SIGTERM");
            // Give it time to shut down gracefully
            await new Promise<void>((resolve) => {
                const timer = setTimeout(() => {
                    if (child) child.kill("SIGKILL");
                    resolve();
                }, 3000);
                child!.on("exit", () => {
                    clearTimeout(timer);
                    resolve();
                });
            });
            child = null;
        }
        try {
            await rm(TEST_VAULT, { recursive: true, force: true });
        } catch {
            // Best effort cleanup
        }
    }, 15000);

    it("should accept initialize and respond with valid JSON-RPC", async () => {
        const responsePromise = waitForResponse(1);
        sendJsonRpc({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "test-client", version: "1.0.0" },
            },
        });

        const response = await responsePromise;
        expect(response).toHaveProperty("jsonrpc", "2.0");
        expect(response).toHaveProperty("result");
    }, 20000);

    it("should list tools with the correct count after initialized notification", async () => {
        // Send initialized notification
        sendJsonRpc({
            jsonrpc: "2.0",
            method: "notifications/initialized",
        });

        // Small delay for notification processing
        await new Promise((resolve) => setTimeout(resolve, 500));

        const responsePromise = waitForResponse(2);
        sendJsonRpc({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/list",
        });

        const response = (await responsePromise) as { result?: { tools?: unknown[] } };
        expect(response.result).toBeDefined();
        expect(response.result!.tools).toBeDefined();
        expect(response.result!.tools!.length).toBe(49);
    }, 20000);

    it("should invoke read_note and return correct content", async () => {
        const responsePromise = waitForResponse(3);
        sendJsonRpc({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "read_note", arguments: { path: "notes/hello.md" } },
        });

        const response = (await responsePromise) as {
            result?: { content?: Array<{ text?: string }> };
        };
        expect(response.result).toBeDefined();
        expect(response.result!.content).toBeDefined();
        expect(response.result!.content![0].text).toContain("Hello");
    }, 20000);

    it("should invoke write_note to create a new file", async () => {
        const responsePromise = waitForResponse(4);
        sendJsonRpc({
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: {
                name: "write_note",
                arguments: {
                    path: "notes/integration-test.md",
                    content: "# Integration Test\n\nWritten by stdio test.",
                },
            },
        });

        const response = (await responsePromise) as {
            result?: { content?: Array<{ text?: string }>; isError?: boolean };
        };
        expect(response.result).toBeDefined();
        expect(response.result!.isError).toBeFalsy();
        expect(response.result!.content![0].text).toMatch(/(written to|created at)/);

        // Verify the file was actually created
        const content = await readFile(join(TEST_VAULT, "notes", "integration-test.md"), "utf-8");
        expect(content).toContain("Integration Test");
    }, 20000);

    it("must have ONLY valid JSON-RPC on stdout (no logging contamination)", () => {
        // This runs after all other tests, checking the accumulated stdout
        assertAllStdoutIsJsonRpc();
    });

    it("should have diagnostic output on stderr (not stdout)", () => {
        // Logger writes to stderr, so we should see some diagnostic output there
        // This confirms logging goes to stderr, not stdout
        // Just verify stderr is non-empty (the server logs startup info)
        expect(stderrBuffer.length).toBeGreaterThan(0);
    });
});
