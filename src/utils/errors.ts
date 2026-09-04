/**
 * Structured error system for quill-mcp.
 * Provides typed error codes so MCP clients can handle failures programmatically
 * instead of parsing error message strings.
 */

// ─── Error Codes ─────────────────────────────────────────────────────

export enum ErrorCode {
    // Path / filesystem errors
    PATH_TRAVERSAL = "PATH_TRAVERSAL",
    PATH_NOT_FOUND = "PATH_NOT_FOUND",
    PATH_EXISTS = "PATH_EXISTS",
    PATH_PROTECTED = "PATH_PROTECTED",
    PATH_IS_ROOT = "PATH_IS_ROOT",
    SYMLINK_ESCAPE = "SYMLINK_ESCAPE",

    // Input validation errors
    INPUT_TOO_LARGE = "INPUT_TOO_LARGE",
    INVALID_REGEX = "INVALID_REGEX",
    INVALID_FORMAT = "INVALID_FORMAT",
    MISSING_REQUIRED = "MISSING_REQUIRED",

    // Memory intelligence errors
    MEMORY_NOT_FOUND = "MEMORY_NOT_FOUND",
    MEMORY_TRANSITION_INVALID = "MEMORY_TRANSITION_INVALID",
    MEMORY_RESURRECTION_NO_EVIDENCE = "MEMORY_RESURRECTION_NO_EVIDENCE",
    MEMORY_CONFLICT = "MEMORY_CONFLICT",

    // Vault errors
    VAULT_NOT_CONFIGURED = "VAULT_NOT_CONFIGURED",
    VAULT_UNREACHABLE = "VAULT_UNREACHABLE",

    // Rate limiting
    RATE_LIMITED = "RATE_LIMITED",

    // Generic
    INTERNAL_ERROR = "INTERNAL_ERROR",
}

// ─── Error Categories ────────────────────────────────────────────────

export type ErrorCategory = "path" | "input" | "memory" | "vault" | "rate" | "internal";

const ERROR_CATEGORIES: Record<ErrorCode, ErrorCategory> = {
    [ErrorCode.PATH_TRAVERSAL]: "path",
    [ErrorCode.PATH_NOT_FOUND]: "path",
    [ErrorCode.PATH_EXISTS]: "path",
    [ErrorCode.PATH_PROTECTED]: "path",
    [ErrorCode.PATH_IS_ROOT]: "path",
    [ErrorCode.SYMLINK_ESCAPE]: "path",
    [ErrorCode.INPUT_TOO_LARGE]: "input",
    [ErrorCode.INVALID_REGEX]: "input",
    [ErrorCode.INVALID_FORMAT]: "input",
    [ErrorCode.MISSING_REQUIRED]: "input",
    [ErrorCode.MEMORY_NOT_FOUND]: "memory",
    [ErrorCode.MEMORY_TRANSITION_INVALID]: "memory",
    [ErrorCode.MEMORY_RESURRECTION_NO_EVIDENCE]: "memory",
    [ErrorCode.MEMORY_CONFLICT]: "memory",
    [ErrorCode.VAULT_NOT_CONFIGURED]: "vault",
    [ErrorCode.VAULT_UNREACHABLE]: "vault",
    [ErrorCode.RATE_LIMITED]: "rate",
    [ErrorCode.INTERNAL_ERROR]: "internal",
};

// ─── Structured Error Class ──────────────────────────────────────────

export class QuillError extends Error {
    readonly code: ErrorCode;
    readonly category: ErrorCategory;
    readonly details?: Record<string, unknown>;

    constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
        super(message);
        this.name = "QuillError";
        this.code = code;
        this.category = ERROR_CATEGORIES[code];
        this.details = details;
    }

    /**
     * Format as MCP error response data.
     * Clients receive this in the error response's `data` field.
     */
    toMcpData(): { code: string; category: ErrorCategory; message: string; details?: Record<string, unknown> } {
        return {
            code: this.code,
            category: this.category,
            message: this.message,
            ...(this.details ? { details: this.details } : {}),
        };
    }
}

// ─── Helper: classify a raw error into a QuillError ──────────────────

/**
 * Wrap an unknown error into a structured MCP error response.
 * If it's already a QuillError, use its code. Otherwise, infer from the message.
 */
export function classifyError(err: unknown): { code: ErrorCode; message: string; data: Record<string, unknown> } {
    if (err instanceof QuillError) {
        return { code: err.code, message: err.message, data: err.toMcpData() };
    }

    const message = err instanceof Error ? err.message : String(err);

    // Infer error code from message patterns
    if (/traversal/i.test(message)) {
        return { code: ErrorCode.PATH_TRAVERSAL, message, data: { code: ErrorCode.PATH_TRAVERSAL, category: "path", message } };
    }
    if (/symlink/i.test(message)) {
        return { code: ErrorCode.SYMLINK_ESCAPE, message, data: { code: ErrorCode.SYMLINK_ESCAPE, category: "path", message } };
    }
    if (/protected/i.test(message)) {
        return { code: ErrorCode.PATH_PROTECTED, message, data: { code: ErrorCode.PATH_PROTECTED, category: "path", message } };
    }
    if (/not found|no such/i.test(message)) {
        return { code: ErrorCode.PATH_NOT_FOUND, message, data: { code: ErrorCode.PATH_NOT_FOUND, category: "path", message } };
    }
    if (/already exists/i.test(message)) {
        return { code: ErrorCode.PATH_EXISTS, message, data: { code: ErrorCode.PATH_EXISTS, category: "path", message } };
    }

    return {
        code: ErrorCode.INTERNAL_ERROR,
        message,
        data: { code: ErrorCode.INTERNAL_ERROR, category: "internal", message },
    };
}

// ─── Input Size Limits ───────────────────────────────────────────────

/** Maximum content size for write operations (512 KB). */
export const MAX_CONTENT_BYTES = 512 * 1024;

/** Maximum query string length (10 KB). */
export const MAX_QUERY_LENGTH = 10 * 1024;

/** Maximum number of items in batch operations. */
export const MAX_BATCH_SIZE = 100;

/** Maximum regex pattern length (1 KB). */
export const MAX_REGEX_LENGTH = 1024;

/** Maximum pagination limit for tools without explicit caps. */
export const MAX_PAGINATION_LIMIT = 500;

/**
 * Validate that content doesn't exceed the maximum size.
 * Returns a QuillError if it does, or null if it's within bounds.
 */
export function validateContentSize(content: string, limit: number = MAX_CONTENT_BYTES): QuillError | null {
    if (Buffer.byteLength(content, "utf-8") > limit) {
        return new QuillError(
            ErrorCode.INPUT_TOO_LARGE,
            `Content exceeds maximum size of ${formatBytes(limit)} (got ${formatBytes(Buffer.byteLength(content, "utf-8"))}).`,
            { limit, actual: Buffer.byteLength(content, "utf-8") },
        );
    }
    return null;
}

/**
 * Validate batch operation size.
 */
export function validateBatchSize(items: unknown[], limit: number = MAX_BATCH_SIZE): QuillError | null {
    if (items.length > limit) {
        return new QuillError(
            ErrorCode.INPUT_TOO_LARGE,
            `Batch size ${items.length} exceeds maximum of ${limit}.`,
            { limit, actual: items.length },
        );
    }
    return null;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
