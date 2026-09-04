import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as z from "zod";
import { safeWriteTarget } from "../utils/vault.js";
import { recordMutation } from "../utils/session-tracker.js";
import { generateMemoryId } from "../utils/memory-id.js";
import { SOURCE_TYPES, IMPORTANCE_LEVELS, getDefaultConfidence, applyDefaults } from "../utils/memory-schema.js";
import type { SourceType } from "../utils/memory-schema.js";
import { stringifyFrontmatter } from "../utils/frontmatter.js";
import { logAuditEntry } from "../utils/audit-log.js";
import { metadataIndex } from "../utils/metadata-index.js";
import { getConfig } from "../utils/config.js";

export const name = "quill_record_decision";
export const description =
    "Record a decision memory. Captures what was decided, why, and by whom. " +
    "Decisions are high-value memories that guide future work and are tracked for conflicts.";

export const inputSchema = z.object({
    project: z.string().describe("Project scope (required for decisions)"),
    content: z.string().describe("The decision and its rationale"),
    entity: z.string().optional().describe("What the decision is about"),
    source_type: z.enum(SOURCE_TYPES).optional().describe("Who made this decision"),
    source_reference: z.string().optional().describe("Decision context"),
    confidence: z.number().min(0).max(1).optional(),
    importance: z.enum(IMPORTANCE_LEVELS).optional(),
    tags: z.array(z.string()).optional(),
});

export async function handler(args: z.infer<typeof inputSchema>) {
    const config = getConfig();
    const now = new Date().toISOString();
    const sourceType = (args.source_type ?? "AGENT") as SourceType;

    const frontmatter = applyDefaults({
        id: generateMemoryId(),
        type: "DECISION",
        status: "ACTIVE",
        confidence: args.confidence ?? getDefaultConfidence(sourceType),
        project: args.project,
        created: now,
        updated: now,
        source_type: sourceType,
        source_reference: args.source_reference,
        importance: args.importance ?? "HIGH",
        entity: args.entity,
        tags: args.tags ?? [],
    });

    const typeDir = config.memory.typeDirs.DECISION ?? "decisions";
    const memDir = config.memory.directories.memories;
    const filePath = join(memDir, typeDir, `${frontmatter.id}.md`);

    const fmObj: Record<string, unknown> = {
        id: frontmatter.id,
        type: frontmatter.type,
        status: frontmatter.status,
        confidence: frontmatter.confidence,
        project: frontmatter.project,
        created: frontmatter.created,
        updated: frontmatter.updated,
        source_type: frontmatter.source_type,
    };
    if (frontmatter.source_reference) fmObj.source_reference = frontmatter.source_reference;
    fmObj.importance = frontmatter.importance;
    if (frontmatter.entity) fmObj.entity = frontmatter.entity;
    if (frontmatter.tags.length > 0) fmObj.tags = frontmatter.tags;

    const fileContent = stringifyFrontmatter(fmObj) + "\n" + args.content;
    const fullPath = await safeWriteTarget(filePath);
    const dir = resolve(fullPath, "..");
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, fileContent, "utf-8");
    await recordMutation({ type: "create", path: filePath });

    await logAuditEntry({
        actor: "agent",
        memoryId: frontmatter.id,
        action: "create",
        newState: { type: "DECISION", project: frontmatter.project, filePath },
    });

    await metadataIndex.updateEntry(filePath);

    return {
        content: [
            {
                type: "text" as const,
                text: `✅ Decision recorded: **${frontmatter.id}**\n- Project: ${frontmatter.project}\n- Confidence: ${frontmatter.confidence}\n- Path: ${filePath}`,
            },
        ],
    };
}
