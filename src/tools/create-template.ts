import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathExists, safeWriteTarget } from "../utils/vault.js";
import * as z from "zod";
import { scheduleHiveRegen } from "./hive-auto-regen.js";

const templates: Record<string, (title: string) => string> = {
    daily: (title) => `---
date: ${new Date().toISOString().split("T")[0]}
tags: [daily]
---

# ${title || "Daily Note"}

## Tasks
- [ ] 

## Notes


## Reflections

`,
    meeting: (title) => `---
date: ${new Date().toISOString().split("T")[0]}
tags: [meeting]
attendees: []
---

# ${title || "Meeting Notes"}

## Agenda


## Discussion


## Action Items
- [ ] 

## Decisions Made

`,
    project: (title) => `---
date: ${new Date().toISOString().split("T")[0]}
tags: [project]
status: active
---

# ${title || "Project Notes"}

## Overview


## Goals
- 

## Timeline


## Notes

`,
    idea: (title) => `---
date: ${new Date().toISOString().split("T")[0]}
tags: [idea]
---

# ${title || "Idea"}

## Concept


## Problem It Solves


## Implementation Ideas


## Next Steps

`,
};

export const name = "create_from_template";
export const description =
    "Create a new note from a predefined template (daily, meeting, project, idea). " +
    "Supports variable interpolation ({{title}}, {{date}}, {{time}}, {{path}}, {{tags}}). " +
    "Use list_templates=true to see available templates without creating a note.";
export const inputSchema = z.object({
    path: z.string().optional().describe("Path for the new note, relative to the vault root"),
    template: z.enum(["daily", "meeting", "project", "idea"]).optional().describe("Template type to use"),
    title: z.string().default("").describe("Title for the note (inserted into template)"),
    tags: z.array(z.string()).optional().describe("Tags to insert into template"),
    list_templates: z.boolean().default(false).describe("If true, list available templates instead of creating a note"),
});

export async function handler({
    path,
    template,
    title,
    tags,
    list_templates,
}: {
    path?: string;
    template?: keyof typeof templates;
    title: string;
    tags?: string[];
    list_templates: boolean;
}) {
    // List templates mode
    if (list_templates) {
        const lines: string[] = ["Available templates:\n"];
        for (const [name, fn] of Object.entries(templates)) {
            const preview = fn("Example Title").split("\n").slice(2, 6).join("\n");
            lines.push(`### ${name}`);
            lines.push(`Preview:\n\`\`\`\n${preview}\n\`\`\`\n`);
        }
        lines.push("Variables: {{title}}, {{date}}, {{time}}, {{path}}, {{tags}}");
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }

    if (!path || !template) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: "Error: 'path' and 'template' are required when list_templates is false.",
                },
            ],
            isError: true,
        };
    }

    const fullPath = await safeWriteTarget(path);

    if (await pathExists(fullPath)) {
        return {
            content: [{ type: "text" as const, text: `Error: Note already exists at "${path}".` }],
            isError: true,
        };
    }

    const templateFn = templates[template];
    let content = templateFn(title);

    // Variable interpolation for tags
    if (tags && tags.length > 0) {
        content = content.replace(/\{\{tags\}\}/g, tags.map((t) => `#${t}`).join(" "));
    }

    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");

    scheduleHiveRegen(path);
    return { content: [{ type: "text" as const, text: `Note created from "${template}" template at "${path}".` }] };
}
