import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import * as z from "zod";
import { safeWriteTarget } from "../utils/vault.js";
import { recordMutation } from "../utils/session-tracker.js";
import { generateMemoryId } from "../utils/memory-id.js";
import {
    MEMORY_TYPES,
    SOURCE_TYPES,
    IMPORTANCE_LEVELS,
    getDefaultConfidence,
    applyDefaults,
} from "../utils/memory-schema.js";
import type { MemoryFrontmatter, SourceType } from "../utils/memory-schema.js";
import { stringifyFrontmatter } from "../utils/frontmatter.js";
import { logAuditEntry } from "../utils/audit-log.js";
import { metadataIndex } from "../utils/metadata-index.js";
import { getConfig } from "../utils/config.js";
import { checkConflicts } from "../utils/conflict-engine.js";
import { scheduleHiveRegen } from "./hive-auto-regen.js";

export const name = "quill_write";
export const description =
    "Write a typed memory file with frontmatter metadata. " +
    "Creates the memory in the appropriate type directory with auto-generated ID, timestamps, and confidence scoring. " +
    "Supports secret detection and conflict checking. Auto-appends .md to custom paths if no extension is provided.";

export const inputSchema = z.object({
    path: z
        .string()
        .describe(
            "Path for the memory file, relative to vault root (overrides auto-path, .md appended if no extension)",
        ),
    content: z.string().describe("Memory content (markdown body)"),
    type: z.enum(MEMORY_TYPES).describe("Memory type"),
    project: z.string().describe("Project scope identifier"),
    confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Confidence score 0.00–1.00 (auto-set from source if omitted)"),
    importance: z.enum(IMPORTANCE_LEVELS).optional().describe("Importance level (default: NORMAL)"),
    entity: z.string().optional().describe("Subject entity for conflict detection"),
    source_type: z.enum(SOURCE_TYPES).optional().describe("Provenance type (default: AGENT)"),
    source_reference: z.string().optional().describe("Source reference detail"),
    tags: z.array(z.string()).optional().describe("Tags for categorization"),
    related: z.array(z.string()).optional().describe("Related memory IDs"),
    supersedes: z.string().optional().describe("ID of memory this replaces"),
    allow_secrets: z.boolean().optional().describe("Set true to confirm write despite secret detection warning"),
});

// Secret detection patterns
const SECRET_PATTERNS = [
    { name: "OpenAI API Key", regex: /sk-[a-zA-Z0-9]{20,}/ },
    { name: "GitHub PAT", regex: /ghp_[a-zA-Z0-9]{36}/ },
    { name: "AWS Access Key", regex: /AKIA[A-Z0-9]{16}/ },
    { name: "Private Key", regex: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/ },
    { name: "Password", regex: /password\s*[:=]\s*\S+/i },
    { name: "Generic Token", regex: /(?:api[_-]?token|access[_-]?token)\s*[:=]\s*\S+/i },
];

function detectSecrets(text: string): Array<{ pattern: string; match: string }> {
    return SECRET_PATTERNS.map((p) => ({
        pattern: p.name,
        match: text.match(p.regex)?.[0] ?? "",
    })).filter((r) => r.match.length > 0);
}

export async function handler(args: z.infer<typeof inputSchema>) {
    const config = getConfig();

    // Secret detection
    if (!args.allow_secrets) {
        const secrets = detectSecrets(args.content);
        if (secrets.length > 0) {
            const names = secrets.map((s) => s.pattern).join(", ");
            return {
                content: [
                    {
                        type: "text" as const,
                        text:
                            `⚠️ Secret detected in content: ${names}. ` +
                            `Set allow_secrets: true to confirm this is not a secret, or remove the sensitive data.`,
                    },
                ],
                isError: true,
            };
        }
    }

    // Build frontmatter
    const now = new Date().toISOString();
    const sourceType = (args.source_type ?? "AGENT") as SourceType;
    const frontmatter: MemoryFrontmatter = applyDefaults({
        id: generateMemoryId(),
        type: args.type,
        status: "ACTIVE",
        confidence: args.confidence ?? getDefaultConfidence(sourceType),
        project: args.project,
        created: now,
        updated: now,
        source_type: sourceType,
        source_reference: args.source_reference,
        importance: args.importance ?? "NORMAL",
        entity: args.entity,
        supersedes: args.supersedes,
        related: args.related ?? [],
        tags: args.tags ?? [],
    });

    // Determine file path
    let filePath: string;
    if (args.path) {
        // Auto-append .md if no file extension is present
        filePath = extname(args.path) ? args.path : `${args.path}.md`;
    } else {
        const typeDir = config.memory.typeDirs[args.type] ?? args.type.toLowerCase();
        const memDir = config.memory.directories.memories;
        filePath = join(memDir, typeDir!, `${frontmatter.id}.md`);
    }

    // Build file content
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
    if (frontmatter.supersedes) fmObj.supersedes = frontmatter.supersedes;
    if (frontmatter.related.length > 0) fmObj.related = frontmatter.related;
    if (frontmatter.tags.length > 0) fmObj.tags = frontmatter.tags;

    const fileContent = stringifyFrontmatter(fmObj) + "\n" + args.content;

    // Write file
    const fullPath = await safeWriteTarget(filePath);

    const dir = resolve(fullPath, "..");
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, fileContent, "utf-8");
    await recordMutation({ type: "create", path: filePath });
    scheduleHiveRegen(filePath);

    // Audit log
    await logAuditEntry({
        actor: "agent",
        memoryId: frontmatter.id,
        action: "create",
        newState: {
            type: frontmatter.type,
            status: "ACTIVE",
            project: frontmatter.project,
            confidence: frontmatter.confidence,
            filePath,
        },
    });

    // Check for conflicts
    const conflicts = await checkConflicts(frontmatter);

    // Update index (re-read from disk)
    await metadataIndex.updateEntry(filePath);

    // Build response
    const lines = [
        `✅ Memory written: **${frontmatter.id}**`,
        `- Type: ${frontmatter.type}`,
        `- Project: ${frontmatter.project}`,
        `- Confidence: ${frontmatter.confidence} (${sourceType})`,
        `- Importance: ${frontmatter.importance}`,
        `- Path: ${filePath}`,
    ];
    if (frontmatter.entity) lines.push(`- Entity: ${frontmatter.entity}`);
    if (conflicts.length > 0) {
        lines.push(`- ⚠️ ${conflicts.length} potential conflict(s) detected — use quill_detect_conflicts for details`);
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}
