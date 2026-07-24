import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveVaultPath, pathExists } from "../utils/vault.js";
import * as z from "zod";

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
export const description = "Create a new note from a predefined template (daily, meeting, project, idea).";
export const inputSchema = z.object({
    path: z.string().describe("Path for the new note, relative to the vault root"),
    template: z.enum(["daily", "meeting", "project", "idea"]).describe("Template type to use"),
    title: z.string().default("").describe("Title for the note (inserted into template)"),
});

export async function handler({ path, template, title }: { path: string; template: keyof typeof templates; title: string }) {
    const fullPath = resolveVaultPath(path);

    if (await pathExists(fullPath)) {
        return { content: [{ type: "text" as const, text: `Error: Note already exists at "${path}".` }], isError: true };
    }

    const templateFn = templates[template];
    const content = templateFn(title);

    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");

    return { content: [{ type: "text" as const, text: `Note created from "${template}" template at "${path}".` }] };
}
