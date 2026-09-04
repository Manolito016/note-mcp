/**
 * Fuzzy search utilities: Levenshtein distance, fuzzy word matching,
 * search operator parsing, and result highlighting.
 */

// ─── Levenshtein Distance ────────────────────────────────────────────

/**
 * Compute the Levenshtein edit-distance between two strings.
 * Uses a single-row DP approach for O(min(m,n)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    // Ensure `a` is the shorter string for space optimisation
    if (a.length > b.length) [a, b] = [b, a];

    const aLen = a.length;
    const bLen = b.length;
    let prev = Array.from({ length: aLen + 1 }, (_, i) => i);
    let curr = new Array<number>(aLen + 1);

    for (let j = 1; j <= bLen; j++) {
        curr[0] = j;
        for (let i = 1; i <= aLen; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[i] = Math.min(
                curr[i - 1] + 1, // insert
                prev[i] + 1, // delete
                prev[i - 1] + cost, // substitute
            );
        }
        [prev, curr] = [curr, prev];
    }
    return prev[aLen];
}

// ─── Fuzzy Word Matching ─────────────────────────────────────────────

const WORD_RE = /[\p{L}\p{N}]+/gu;

function tokenize(text: string): string[] {
    return text.toLowerCase().match(WORD_RE) ?? [];
}

/**
 * Return true when every token in `query` has a fuzzy match
 * (within `tolerance` edits) in at least one word of `text`.
 *
 * Tolerance auto-scales by token length when not explicitly provided:
 *   ≤ 3 chars  → 0  (exact only)
 *   ≤ 6 chars  → 1
 *   ≤ 9 chars  → 2
 *   >  9 chars → 3
 */
export function fuzzyMatch(query: string, text: string, tolerance?: number): boolean {
    const queryTokens = tokenize(query);
    if (!queryTokens.length) return false;

    const textTokens = tokenize(text);
    if (!textTokens.length) return false;

    for (const qt of queryTokens) {
        const tol = tolerance ?? autoTolerance(qt.length);
        let found = false;
        for (const tt of textTokens) {
            // Skip words whose length difference alone exceeds tolerance
            if (Math.abs(qt.length - tt.length) > tol) continue;
            if (levenshteinDistance(qt, tt) <= tol) {
                found = true;
                break;
            }
        }
        if (!found) return false;
    }
    return true;
}

export function autoTolerance(wordLength: number): number {
    if (wordLength <= 3) return 0;
    if (wordLength <= 6) return 1;
    if (wordLength <= 9) return 2;
    return 3;
}

// ─── Search Operator Parsing ─────────────────────────────────────────

export interface ParsedQuery {
    /** Free-form text terms (AND-ed together) */
    terms: string[];
    /** Quoted `"exact phrases"` */
    phrases: string[];
    /** `tag:value` filters */
    tags: string[];
    /** `path:value` filters */
    paths: string[];
    /** `-excluded` terms */
    excludes: string[];
    /** Whether any structured operators were found */
    hasOperators: boolean;
}

/**
 * Parse an Obsidian-style query string into structured parts.
 *
 * Supported syntax:
 *   `"exact phrase"`  – match this phrase literally
 *   `tag:value`       – filter by frontmatter tag
 *   `path:value`      – filter by file path substring
 *   `-term`           – exclude lines containing term
 *   `bare words`      – regular text terms (AND logic)
 */
export function parseSearchOperators(query: string): ParsedQuery {
    const result: ParsedQuery = {
        terms: [],
        phrases: [],
        tags: [],
        paths: [],
        excludes: [],
        hasOperators: false,
    };

    let remaining = query.trim();

    // 1. Extract quoted phrases
    const phraseRe = /"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = phraseRe.exec(remaining)) !== null) {
        result.phrases.push(m[1]);
        result.hasOperators = true;
    }
    remaining = remaining.replace(phraseRe, "").trim();

    // 2. Process space-separated tokens
    const tokens = remaining.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
        if (token.startsWith("tag:")) {
            result.tags.push(token.slice(4).toLowerCase());
            result.hasOperators = true;
        } else if (token.startsWith("path:")) {
            result.paths.push(token.slice(5).toLowerCase());
            result.hasOperators = true;
        } else if (token.startsWith("-") && token.length > 1) {
            result.excludes.push(token.slice(1));
            result.hasOperators = true;
        } else {
            result.terms.push(token);
        }
    }

    return result;
}

// ─── Result Highlighting ─────────────────────────────────────────────

/**
 * Wrap every occurrence of `pattern` in `text` with `open`/`close` markers.
 * Case-insensitive.  Returns the original text when there is no match.
 */
export function highlightMatches(text: string, patterns: string[], open = "**", close = "**"): string {
    if (!patterns.length) return text;

    // Build a single regex that matches any of the patterns
    const escaped = patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
    if (!escaped.length) return text;

    const combined = new RegExp(`(${escaped.join("|")})`, "gi");
    return text.replace(combined, `${open}$1${close}`);
}
