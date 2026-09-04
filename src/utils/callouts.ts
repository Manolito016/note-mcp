/**
 * Parse Obsidian callouts from markdown content.
 * Callout syntax: > [!type] Optional Title
 */

export interface Callout {
    type: string;
    title: string;
    content: string;
    foldable: boolean;
    collapsed: boolean;
    line: number;
}

/** Known Obsidian callout types and their aliases */
export const CALLOUT_TYPES: Record<string, { aliases: string[]; color: string }> = {
    note: { aliases: [], color: "blue" },
    abstract: { aliases: ["summary", "tldr"], color: "teal" },
    info: { aliases: [], color: "blue" },
    todo: { aliases: [], color: "blue" },
    tip: { aliases: ["hint", "important"], color: "cyan" },
    success: { aliases: ["check", "done"], color: "green" },
    question: { aliases: ["help", "faq"], color: "yellow" },
    warning: { aliases: ["caution", "attention"], color: "orange" },
    failure: { aliases: ["fail", "missing"], color: "red" },
    danger: { aliases: ["error"], color: "red" },
    bug: { aliases: [], color: "red" },
    example: { aliases: [], color: "purple" },
    quote: { aliases: ["cite"], color: "gray" },
};

/**
 * Resolve a callout type alias to its canonical form.
 */
export function resolveCalloutType(type: string): string {
    const lower = type.toLowerCase();
    for (const [canonical, info] of Object.entries(CALLOUT_TYPES)) {
        if (canonical === lower || info.aliases.includes(lower)) {
            return canonical;
        }
    }
    return lower; // Custom callout type
}

/**
 * Extract all callouts from markdown content.
 */
export function extractCallouts(content: string): Callout[] {
    const callouts: Callout[] = [];
    const lines = content.split("\n");

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        // Match callout start: > [!type] or > [!type]- or > [!type]+
        const calloutMatch = line.match(/^>\s*\[!([^\]]+)\]([+-])?\s*(.*)?$/);
        if (calloutMatch) {
            const type = calloutMatch[1];
            const foldChar = calloutMatch[2];
            const titleText = calloutMatch[3]?.trim() || "";
            const foldable = foldChar !== undefined;
            const collapsed = foldChar === "-";

            // Collect content lines (subsequent lines starting with >)
            const contentLines: string[] = [];
            let j = i + 1;
            while (j < lines.length && (lines[j].startsWith(">") || lines[j].trim() === "")) {
                const contentLine = lines[j];
                if (contentLine.startsWith(">")) {
                    // Remove the > prefix
                    contentLines.push(contentLine.replace(/^>\s?/, ""));
                } else if (contentLine.trim() === "") {
                    // Blank line might be part of callout or end it
                    // Check if next line continues the callout
                    if (j + 1 < lines.length && lines[j + 1].startsWith(">")) {
                        contentLines.push("");
                    } else {
                        break;
                    }
                }
                j++;
            }

            callouts.push({
                type: resolveCalloutType(type),
                title: titleText,
                content: contentLines.join("\n").trim(),
                foldable,
                collapsed,
                line: i + 1, // 1-based line number
            });

            i = j;
        } else {
            i++;
        }
    }

    return callouts;
}

/**
 * Format a callout as markdown string.
 */
export function formatCallout(
    type: string,
    title?: string,
    content?: string,
    foldable?: boolean,
    collapsed?: boolean,
): string {
    const foldSuffix = foldable ? (collapsed ? "-" : "+") : "";
    const titlePart = title ? ` ${title}` : "";
    const header = `> [!${type}]${foldSuffix}${titlePart}`;

    if (!content) {
        return header;
    }

    const contentLines = content.split("\n").map((line) => `> ${line}`);
    return [header, ...contentLines].join("\n");
}
