/**
 * Memory checkpoint system for context reconstruction after compaction.
 * Creates structured markdown checkpoints and restores agent context.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { safeInternalPath } from "./vault.js";
import { getConfig } from "./config.js";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter.js";
import { retrieve } from "./retrieval-engine.js";
import { logAuditEntry } from "./audit-log.js";
import { estimateTokens } from "./tokens.js";
import type { RetrievalResult } from "./retrieval-engine.js";

export interface CheckpointInput {
    project: string;
    label?: string;
    objective?: string;
    currentState?: string;
    knownProblems?: string[];
    nextActions?: string[];
}

export interface CheckpointResult {
    checkpointId: string;
    filePath: string;
    memoryCount: number;
    sections: {
        decisions: RetrievalResult[];
        constraints: RetrievalResult[];
        discoveries: RetrievalResult[];
        errors: RetrievalResult[];
        lessons: RetrievalResult[];
        architecture: RetrievalResult[];
        other: RetrievalResult[];
    };
}

export interface RestoreResult {
    checkpoint?: CheckpointData;
    memories: RetrievalResult[];
    mode: string;
    tokenEstimate: number;
}

export interface CheckpointData {
    label: string;
    project: string;
    created: string;
    objective?: string;
    currentState?: string;
    knownProblems: string[];
    nextActions: string[];
    memoryIds: string[];
}

/**
 * Create a memory checkpoint for a project.
 */
export async function createCheckpoint(input: CheckpointInput): Promise<CheckpointResult> {
    const config = getConfig();
    // Validate configured state directory is within vault
    const validatedStateDir = await safeInternalPath(config.memory.directories.state);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const checkpointId = `checkpoint-${timestamp}`;
    const fileName = `${checkpointId}.md`;
    const filePath = join(validatedStateDir, fileName);

    // Retrieve memories by type for organized sections
    const [decisions, constraints, discoveries, errors, lessons, architecture] = await Promise.all([
        retrieve({ project: input.project, type: "DECISION", mode: "deep", limit: 10 }),
        retrieve({ project: input.project, type: "CONSTRAINT", mode: "deep", limit: 10 }),
        retrieve({ project: input.project, type: "DISCOVERY", mode: "deep", limit: 10 }),
        retrieve({ project: input.project, type: "ERROR", mode: "deep", limit: 10 }),
        retrieve({ project: input.project, type: "LESSON", mode: "deep", limit: 10 }),
        retrieve({ project: input.project, type: "ARCHITECTURE", mode: "deep", limit: 10 }),
    ]);

    // Collect remaining active memories as "other"
    const collectedIds = new Set([
        ...decisions.map((r) => r.memory.id),
        ...constraints.map((r) => r.memory.id),
        ...discoveries.map((r) => r.memory.id),
        ...errors.map((r) => r.memory.id),
        ...lessons.map((r) => r.memory.id),
        ...architecture.map((r) => r.memory.id),
    ]);
    const other = await retrieve({
        project: input.project,
        mode: "deep",
        limit: 10,
        contextMemoryIds: [...collectedIds],
    });

    const allMemories = [
        ...decisions,
        ...constraints,
        ...discoveries,
        ...errors,
        ...lessons,
        ...architecture,
        ...other,
    ];
    const allIds = allMemories.map((r) => r.memory.id);

    // Build checkpoint markdown
    const frontmatter = {
        id: checkpointId,
        type: "CHECKPOINT",
        project: input.project,
        created: new Date().toISOString(),
        label: input.label ?? `Checkpoint ${timestamp}`,
        memory_count: allIds.length,
    };

    const sections: string[] = [];

    if (input.objective) {
        sections.push("## Objective\n", input.objective, "");
    }
    if (input.currentState) {
        sections.push("## Current State\n", input.currentState, "");
    }
    if (decisions.length > 0) {
        sections.push("## Important Decisions\n");
        for (const r of decisions) {
            sections.push(
                `- **${r.memory.entity ?? "Decision"}**: ${r.contentPreview.slice(0, 100)} (confidence: ${r.memory.confidence})`,
            );
        }
        sections.push("");
    }
    if (constraints.length > 0) {
        sections.push("## Known Constraints\n");
        for (const r of constraints) {
            sections.push(`- ${r.contentPreview.slice(0, 100)}`);
        }
        sections.push("");
    }
    if (input.knownProblems && input.knownProblems.length > 0) {
        sections.push("## Known Problems\n");
        for (const problem of input.knownProblems) {
            sections.push(`- ${problem}`);
        }
        sections.push("");
    }
    if (input.nextActions && input.nextActions.length > 0) {
        sections.push("## Next Actions\n");
        for (let i = 0; i < input.nextActions.length; i++) {
            sections.push(`${i + 1}. ${input.nextActions[i]}`);
        }
        sections.push("");
    }
    if (discoveries.length > 0) {
        sections.push("## Recent Discoveries\n");
        for (const r of discoveries) {
            sections.push(`- ${r.contentPreview.slice(0, 100)}`);
        }
        sections.push("");
    }
    if (lessons.length > 0) {
        sections.push("## Lessons Learned\n");
        for (const r of lessons) {
            sections.push(`- ${r.contentPreview.slice(0, 100)}`);
        }
        sections.push("");
    }

    sections.push("## Relevant Memory IDs\n");
    for (const id of allIds) {
        sections.push(`- ${id}`);
    }

    const content =
        stringifyFrontmatter(frontmatter as unknown as Record<string, unknown>) + "\n" + sections.join("\n");

    // Write checkpoint file
    const fullPath = filePath; // Already absolute from validatedStateDir
    const dir = resolve(fullPath, "..");
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, content, "utf-8");

    // Audit log
    await logAuditEntry({
        actor: "agent",
        memoryId: checkpointId,
        action: "checkpoint_created",
        newState: { project: input.project, memoryCount: allIds.length, label: input.label },
    });

    return {
        checkpointId,
        filePath,
        memoryCount: allIds.length,
        sections: { decisions, constraints, discoveries, errors, lessons, architecture, other },
    };
}

/**
 * Restore context from the latest checkpoint.
 */
export async function restoreContext(
    project?: string,
    mode: "compact" | "standard" | "deep" = "standard",
): Promise<RestoreResult> {
    const config = getConfig();
    // Validate configured state directory is within vault
    const stateDir = await safeInternalPath(config.memory.directories.state);

    // Find the latest checkpoint
    let checkpointData: CheckpointData | undefined;
    try {
        const { readdir } = await import("node:fs/promises");
        const files = await readdir(stateDir);
        const checkpointFiles = files
            .filter((f) => f.startsWith("checkpoint-") && f.endsWith(".md"))
            .sort()
            .reverse();

        if (checkpointFiles.length > 0) {
            const content = await readFile(join(stateDir, checkpointFiles[0]), "utf-8");
            const { frontmatter } = parseFrontmatter(content);

            if (project && frontmatter.project !== project) {
                // Look for a checkpoint matching the project
                for (const file of checkpointFiles) {
                    const c = await readFile(join(stateDir, file), "utf-8");
                    const { frontmatter: fm } = parseFrontmatter(c);
                    if (fm.project === project) {
                        checkpointData = {
                            label: (fm.label as string) ?? "",
                            project: fm.project as string,
                            created: fm.created as string,
                            knownProblems: [],
                            nextActions: [],
                            memoryIds: [],
                        };
                        break;
                    }
                }
            } else {
                checkpointData = {
                    label: (frontmatter.label as string) ?? "",
                    project: (frontmatter.project as string) ?? "default",
                    created: (frontmatter.created as string) ?? "",
                    knownProblems: [],
                    nextActions: [],
                    memoryIds: [],
                };
            }
        }
    } catch {
        // No checkpoint directory or files
    }

    // Retrieve memories based on mode
    const memories = await retrieve({
        project: checkpointData?.project ?? project,
        mode,
    });

    // Estimate token cost
    const totalText = memories.map((r) => r.contentPreview).join(" ");
    const tokenEstimate = estimateTokens(totalText);

    // Audit log
    await logAuditEntry({
        actor: "agent",
        memoryId: checkpointData?.label ?? "restore",
        action: "checkpoint_restored",
        newState: { mode, memoryCount: memories.length, tokenEstimate },
    });

    return {
        checkpoint: checkpointData,
        memories,
        mode,
        tokenEstimate,
    };
}
