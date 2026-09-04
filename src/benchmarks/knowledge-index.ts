import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { initVault } from "../utils/vault.js";
import { DISCOVERY_FIELDS, knowledgeIndex } from "../utils/knowledge-index.js";

const sizes = process.argv
    .slice(2)
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0);
const benchmarkSizes = sizes.length ? sizes : [100, 1_000, 10_000];
delete process.argv[2];

for (const size of benchmarkSizes) {
    const root = await mkdtemp(join(tmpdir(), `quill-discovery-${size}-`));
    try {
        const folder = join(root, "notes");
        await mkdir(folder, { recursive: true });
        for (let start = 0; start < size; start += 250) {
            await Promise.all(
                Array.from({ length: Math.min(250, size - start) }, (_, offset) => {
                    const id = start + offset;
                    return writeFile(
                        join(folder, `note-${id}${id === Math.floor(size / 2) ? "-PRD" : ""}.md`),
                        `---\ntitle: Note ${id}\ntags: [${id % 10 === 0 ? "template" : "general"}]\n---\n# Heading ${id}\nKnowledge body ${id}.`,
                        "utf-8",
                    );
                }),
            );
        }
        process.env.NOTES_VAULT_PATH = root;
        initVault();
        knowledgeIndex.reset();
        const buildStart = performance.now();
        await knowledgeIndex.ensureSynchronized();
        const buildMs = performance.now() - buildStart;
        const samples: number[] = [];
        for (let i = 0; i < 100; i++) {
            const start = performance.now();
            knowledgeIndex.discover("PRD", ".", [...DISCOVERY_FIELDS], ["file", "folder"]);
            samples.push(performance.now() - start);
        }
        samples.sort((a, b) => a - b);
        console.log(
            JSON.stringify({
                notes: size,
                build_ms: Number(buildMs.toFixed(2)),
                lookup_median_ms: Number(samples[50].toFixed(3)),
                lookup_p95_ms: Number(samples[95].toFixed(3)),
            }),
        );
    } finally {
        knowledgeIndex.reset();
        await rm(root, { recursive: true, force: true });
    }
}
