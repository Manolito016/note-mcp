/**
 * Extract Obsidian-flavored links from content.
 * Supports wikilinks, embeds, heading/block references, and markdown links.
 */

export interface WikiLink {
    target: string;
    displayText?: string;
    heading?: string;
    blockId?: string;
    isEmbed: boolean;
}

export interface MarkdownLink {
    text: string;
    target: string;
    isEmbed: boolean;
}

export interface ExtractedLinks {
    wiki: WikiLink[];
    markdown: MarkdownLink[];
    /** All link targets (wiki + markdown) for graph building */
    allTargets: string[];
}

/**
 * Parse a wikilink string into its components.
 * Examples:
 *   "Note" → { target: "Note" }
 *   "Note|Display" → { target: "Note", displayText: "Display" }
 *   "Note#Heading" → { target: "Note", heading: "Heading" }
 *   "Note#^block-id" → { target: "Note", blockId: "block-id" }
 */
function parseWikiLink(raw: string, isEmbed: boolean): WikiLink {
    let target = raw.trim();
    let displayText: string | undefined;
    let heading: string | undefined;
    let blockId: string | undefined;

    // Extract display text: [[target|display]]
    const pipeIndex = target.indexOf("|");
    if (pipeIndex !== -1) {
        displayText = target.slice(pipeIndex + 1).trim();
        target = target.slice(0, pipeIndex).trim();
    }

    // Extract block ID: [[target#^block-id]]
    const blockMatch = target.match(/#\^([^\s#]+)$/);
    if (blockMatch) {
        blockId = blockMatch[1];
        target = target.slice(0, -blockMatch[0].length).trim();
    }
    // Extract heading: [[target#Heading]]
    else {
        const headingMatch = target.match(/#(.+)$/);
        if (headingMatch) {
            heading = headingMatch[1].trim();
            target = target.slice(0, -headingMatch[0].length).trim();
        }
    }

    return { target, displayText, heading, blockId, isEmbed };
}

/**
 * Extract all Obsidian-flavored links from content.
 */
export function extractLinks(content: string): ExtractedLinks {
    const wikiLinks: WikiLink[] = [];
    const markdownLinks: MarkdownLink[] = [];
    const allTargets: string[] = [];

    // Embed wikilinks: ![[target]] or ![[target|display]]
    // Must match before regular wikilinks to avoid double-matching
    const embedWikiRegex = /!\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = embedWikiRegex.exec(content)) !== null) {
        const parsed = parseWikiLink(match[1], true);
        if (parsed.target.length > 0) {
            wikiLinks.push(parsed);
            allTargets.push(parsed.target);
        }
    }

    // Regular wikilinks: [[target]] or [[target|display]]
    // Exclude already-matched embeds by checking for preceding !
    const wikiRegex = /(?<!\!)\[\[([^\]]+)\]\]/g;
    while ((match = wikiRegex.exec(content)) !== null) {
        const parsed = parseWikiLink(match[1], false);
        if (parsed.target.length > 0) {
            wikiLinks.push(parsed);
            allTargets.push(parsed.target);
        }
    }

    // Embed markdown: ![alt](path)
    const embedMdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    while ((match = embedMdRegex.exec(content)) !== null) {
        markdownLinks.push({ text: match[1], target: match[2], isEmbed: true });
    }

    // Regular markdown links: [text](target) - only internal .md links
    // Exclude already-matched embeds by checking for preceding !
    const mdRegex = /(?<!\!)\[([^\]]+)\]\(([^)]+\.md(?:#[^)]*)?)\)/g;
    while ((match = mdRegex.exec(content)) !== null) {
        markdownLinks.push({ text: match[1], target: match[2], isEmbed: false });
        allTargets.push(match[2]);
    }

    return { wiki: wikiLinks, markdown: markdownLinks, allTargets };
}

/**
 * Extract only link targets (flat list) for graph building.
 * Backward-compatible with existing code.
 */
export function extractLinkTargets(content: string): string[] {
    const { allTargets } = extractLinks(content);
    return allTargets;
}
