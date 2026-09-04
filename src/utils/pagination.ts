export const MAX_DISCOVERY_LIMIT = 200;

export function boundedLimit(limit: number | undefined, fallback: number): number {
    return Math.max(1, Math.min(MAX_DISCOVERY_LIMIT, Math.floor(limit ?? fallback)));
}

export function decodeCursor(cursor?: string): number {
    if (!cursor) return 0;
    try {
        const value = Number.parseInt(Buffer.from(cursor, "base64url").toString("utf-8"), 10);
        if (!Number.isSafeInteger(value) || value < 0) throw new Error();
        return value;
    } catch {
        throw new Error("Invalid pagination cursor.");
    }
}

export function encodeCursor(offset: number): string {
    return Buffer.from(String(offset), "utf-8").toString("base64url");
}
