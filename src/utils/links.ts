/**
 * Extract wiki-style links ([[note-name]]) and markdown links ([text](path.md)) from content.
 */
export function extractLinks(content: string): { wiki: string[]; markdown: { text: string; target: string }[] } {
    const wikiLinks: string[] = [];
    const markdownLinks: { text: string; target: string }[] = [];

    // Wiki-style links: [[target]] or [[target|display text]]
    const wikiRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match;
    while ((match = wikiRegex.exec(content)) !== null) {
        wikiLinks.push(match[1].trim());
    }

    // Markdown links: [text](target) - only internal .md links
    const mdRegex = /\[([^\]]+)\]\(([^)]+\.md(?:#[^)]*)?)\)/g;
    while ((match = mdRegex.exec(content)) !== null) {
        markdownLinks.push({ text: match[1], target: match[2] });
    }

    return { wiki: wikiLinks, markdown: markdownLinks };
}
