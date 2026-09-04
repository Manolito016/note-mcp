/**
 * Token cost estimation utilities.
 * Provides approximate token counts for text content to help users
 * manage context budget when working with LLMs.
 *
 * Estimation based on: ~4 characters per token, ~0.75 words per token.
 */

/**
 * Estimate token count for a text string.
 * Uses character-based approximation: ~4 chars per token.
 */
export function estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

/**
 * Estimate token count for a text string using word-based approximation.
 * More accurate for natural language: ~0.75 words per token.
 */
export function estimateTokensByWords(text: string): number {
    if (!text) return 0;
    const words = text
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);
    return Math.ceil(words.length / 0.75);
}

/**
 * Estimate tokens for a structured result (JSON output).
 * Accounts for keys, values, and structural overhead.
 */
export function estimateResultTokens(data: unknown): number {
    const json = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return estimateTokens(json);
}

/**
 * Format token estimate for display.
 */
export function formatTokenEstimate(tokens: number): string {
    if (tokens < 1000) return `~${tokens} tokens`;
    if (tokens < 10000) return `~${(tokens / 1000).toFixed(1)}k tokens`;
    return `~${Math.round(tokens / 1000)}k tokens`;
}
