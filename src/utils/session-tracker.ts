/**
 * Session tracking for vault mutations.
 * Records create, update, delete, and move operations across sessions.
 * Stores data in a JSON session log file within the vault.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { safeInternalPath } from "./vault.js";

export interface VaultMutation {
    type: "create" | "update" | "delete" | "move" | "restore";
    path: string;
    oldPath?: string; // For move operations
    timestamp: string; // ISO 8601
    sessionId: string;
}

export interface SessionRecord {
    sessionId: string;
    startedAt: string;
    endedAt?: string;
    mutations: VaultMutation[];
    summary?: {
        created: number;
        updated: number;
        deleted: number;
        moved: number;
        restored: number;
    };
}

const SESSION_DIR = ".quill-sessions";
const SESSION_FILE = "sessions.json";

interface SessionStore {
    sessions: SessionRecord[];
    activeSession?: string;
}

let currentSessionId: string | undefined;
let sessionStore: SessionStore | undefined;

/**
 * Generate a unique session ID based on timestamp.
 */
function generateSessionId(): string {
    const now = new Date();
    return `session-${now.toISOString().replace(/[:.]/g, "-")}`;
}

/**
 * Get the path to the session store file.
 * Validates the configured session directory is within the vault.
 */
async function getSessionStorePath(): Promise<string> {
    const validatedDir = await safeInternalPath(SESSION_DIR);
    return join(validatedDir, SESSION_FILE);
}

/**
 * Load the session store from disk.
 */
async function loadSessionStore(): Promise<SessionStore> {
    if (sessionStore) return sessionStore;

    const storePath = await getSessionStorePath();
    try {
        const content = await readFile(storePath, "utf-8");
        sessionStore = JSON.parse(content) as SessionStore;
    } catch {
        sessionStore = { sessions: [] };
    }
    return sessionStore!;
}

/**
 * Save the session store to disk.
 */
async function saveSessionStore(store: SessionStore): Promise<void> {
    const storePath = await getSessionStorePath();
    const dir = resolve(storePath, "..");
    await mkdir(dir, { recursive: true });
    await writeFile(storePath, JSON.stringify(store, null, 2), "utf-8");
}

/**
 * Start a new tracking session.
 * Returns the session ID.
 */
export async function startSession(): Promise<string> {
    const store = await loadSessionStore();

    // End any active session
    if (store.activeSession) {
        const active = store.sessions.find((s) => s.sessionId === store.activeSession);
        if (active && !active.endedAt) {
            active.endedAt = new Date().toISOString();
            active.summary = computeSummary(active.mutations);
        }
    }

    const sessionId = generateSessionId();
    const record: SessionRecord = {
        sessionId,
        startedAt: new Date().toISOString(),
        mutations: [],
    };

    store.sessions.push(record);
    store.activeSession = sessionId;
    currentSessionId = sessionId;

    await saveSessionStore(store);
    return sessionId;
}

/**
 * Record a mutation in the current session.
 */
export async function recordMutation(mutation: Omit<VaultMutation, "sessionId" | "timestamp">): Promise<void> {
    if (!currentSessionId) {
        await startSession();
    }

    const store = await loadSessionStore();
    const session = store.sessions.find((s) => s.sessionId === currentSessionId);
    if (!session) return;

    session.mutations.push({
        ...mutation,
        sessionId: currentSessionId!,
        timestamp: new Date().toISOString(),
    });

    await saveSessionStore(store);
}

/**
 * End the current session.
 */
export async function endSession(): Promise<SessionRecord | undefined> {
    if (!currentSessionId) return undefined;

    const store = await loadSessionStore();
    const session = store.sessions.find((s) => s.sessionId === currentSessionId);

    if (session) {
        session.endedAt = new Date().toISOString();
        session.summary = computeSummary(session.mutations);
    }

    store.activeSession = undefined;
    currentSessionId = undefined;

    await saveSessionStore(store);
    return session;
}

/**
 * Get the current session ID.
 */
export function getCurrentSessionId(): string | undefined {
    return currentSessionId;
}

/**
 * Get session history.
 */
export async function getSessions(limit = 10): Promise<SessionRecord[]> {
    const store = await loadSessionStore();
    return store.sessions.slice(-limit).reverse();
}

/**
 * Get a specific session by ID.
 */
export async function getSession(sessionId: string): Promise<SessionRecord | undefined> {
    const store = await loadSessionStore();
    return store.sessions.find((s) => s.sessionId === sessionId);
}

/**
 * Compute summary from mutations.
 */
function computeSummary(mutations: VaultMutation[]): SessionRecord["summary"] {
    return {
        created: mutations.filter((m) => m.type === "create").length,
        updated: mutations.filter((m) => m.type === "update").length,
        deleted: mutations.filter((m) => m.type === "delete").length,
        moved: mutations.filter((m) => m.type === "move").length,
        restored: mutations.filter((m) => m.type === "restore").length,
    };
}
