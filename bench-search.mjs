import { initVault } from "./dist/utils/vault.js";
import { searchIndex } from "./dist/utils/search-index.js";
import { performance } from "node:perf_hooks";

const root = initVault();
console.log("Vault root:", root);
console.log("\n=== Search Index Performance ===\n");

// Build index
const buildStart = performance.now();
await searchIndex.ensureSynchronized();
const buildMs = performance.now() - buildStart;

const docs = searchIndex.getDocuments();
const terms = searchIndex.getAllTerms();

console.log(`Index build time: ${buildMs.toFixed(2)}ms`);
console.log(`Documents indexed: ${docs.length}`);
console.log(`Unique terms: ${terms.length}`);

// Test queries
const queries = [
    "search",
    "canvas generation",
    "prime orchestrator",
    "backend framework",
    "authentication",
];

console.log("\n=== Query Performance ===\n");

for (const query of queries) {
    const queryTokens = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    
    // Test inverted index lookup
    const lookupStart = performance.now();
    const inverted = searchIndex.getInvertedIndex();
    const candidatePaths = new Set();
    for (const token of queryTokens) {
        const posting = inverted.get(token);
        if (posting) {
            for (const p of posting) candidatePaths.add(p);
        }
    }
    const lookupMs = performance.now() - lookupStart;
    
    // Test full search
    const searchStart = performance.now();
    const candidates = docs.filter(d => candidatePaths.has(d.path));
    const searchMs = performance.now() - searchStart;
    
    console.log(`Query: "${query}"`);
    console.log(`  Candidates found: ${candidatePaths.size} / ${docs.length} docs`);
    console.log(`  Lookup time: ${lookupMs.toFixed(3)}ms`);
    console.log(`  Filter time: ${searchMs.toFixed(3)}ms`);
    console.log(`  Reduction: ${((1 - candidatePaths.size / docs.length) * 100).toFixed(1)}%`);
    console.log();
}
