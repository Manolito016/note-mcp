# Knowledge discovery architecture

Quill's discovery layer is a lightweight in-memory catalog separate from the existing memory/BM25 index and the backward-compatible `search_notes` content scanner. It indexes every resource's normalized vault-relative path, filename, extension, containing folder, size, and modified time. Markdown resources additionally contribute YAML `title`, normalized/deduplicated `tags` and `aliases`, headings, a short preview, and token frequencies. Full note bodies are not retained.

## Ranking and ordering

`discover` evaluates all requested fields by default. Its primary weights preserve this order: exact filename/stem (1.00), exact title (0.98), exact alias (0.96), exact tag (0.94), filename substring (0.86), path (0.78), heading (0.72), then all-token content match (up to 0.69). Substring title/alias/tag scores sit below their exact variants. A bounded corroboration bonus of at most 0.015 rewards resources matched in multiple fields without overtaking a higher-priority primary match.

Results sort by descending score. Equal scores use ascending vault-relative path under the fixed `en` locale, then resource type. This is the stable deterministic tie-breaker used before cursor pagination.

## Synchronization and invalidation

The first discovery call builds the catalog. Built-in create, write, append, metadata, copy, move, rename, restore, and delete workflows use the shared mutation hook to mark it dirty. The existing external-change watcher does the same when its polling snapshot changes. The next discovery call reconciles directory entries and `mtime:size` fingerprints, parsing only new or changed Markdown files and removing missing paths. Moves and renames therefore become one removal plus one addition, preventing stale entries. Clean indexed lookups do not rescan the filesystem.

`refresh_knowledge_index` discards and rebuilds the complete catalog for explicit recovery. Trash, session internals, `.git`, `node_modules`, and symbolic links are excluded.

## MCP interfaces

- `discover`: ranked cross-field file/folder discovery with folder/type/field filters and cursor pagination.
- `search_files`: low-level case-insensitive substring or safe `*`, `?`, and character-class glob matching.
- `search_by_tag`: normalized YAML tag matching with `AND` or `OR`.
- `list_folder`: recursive or shallow browsing with optional concise metadata.
- `refresh_knowledge_index`: explicit complete rebuild.

All interfaces default to concise results, cap a page at 200 entries, and return opaque continuation cursors. User paths are resolved through Quill's vault boundary check; traversal and outside absolute paths are rejected. Directory scans skip symlinks so they cannot escape the configured knowledge root.

## Performance benchmark

Run `npm run benchmark:discovery` to generate isolated 100, 1,000, and 10,000-note fixtures and report initial build time plus median/p95 warm lookup time. Fixture directories are created beneath the operating-system temporary directory and removed afterward.

Results recorded on 2026-09-01 on the development Windows host (100 warm lookups per fixture):

|  Notes | Initial build | Median lookup | p95 lookup |
| -----: | ------------: | ------------: | ---------: |
|    100 |      74.55 ms |      0.091 ms |   0.295 ms |
|  1,000 |     710.57 ms |      1.019 ms |   1.849 ms |
| 10,000 |   6,103.87 ms |      9.950 ms |  15.073 ms |
