/**
 * Parse YAML frontmatter from markdown content.
 * Returns the frontmatter object and the content without frontmatter.
 */
export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; content: string } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
        return { frontmatter: {}, content };
    }

    const frontmatterStr = match[1];
    const remainingContent = match[2];

    const frontmatter: Record<string, unknown> = {};
    const lines = frontmatterStr.split("\n");

    for (const line of lines) {
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) continue;

        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();

        if (key) {
            frontmatter[key] = parseValue(value);
        }
    }

    return { frontmatter, content: remainingContent };
}

/**
 * Parse a YAML value string into its appropriate type.
 */
function parseValue(value: string): unknown {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null" || value === "") return null;
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
    if (value.startsWith("[") && value.endsWith("]")) {
        return value
            .slice(1, -1)
            .split(",")
            .map((item) => parseValue(item.trim()));
    }
    return value;
}

/**
 * Extract tags from markdown content.
 * Finds hashtags in the format #tag or #tag/subtag.
 */
export function extractTags(content: string): string[] {
    const tagRegex = /(?:^|\s)#([a-zA-Z0-9_/-]+)/g;
    const tags: Set<string> = new Set();
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
        tags.add(match[1]);
    }

    return Array.from(tags);
}

/**
 * Stringify frontmatter back to YAML format.
 */
export function stringifyFrontmatter(frontmatter: Record<string, unknown>): string {
    const lines = Object.entries(frontmatter).map(([key, value]) => {
        if (Array.isArray(value)) {
            return `${key}: [${value.join(", ")}]`;
        }
        return `${key}: ${value}`;
    });

    return `---\n${lines.join("\n")}\n---\n`;
}
