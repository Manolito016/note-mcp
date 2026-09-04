# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-09-04

### Added

- **Structured Error System:**
  - New `errors.ts` module with `QuillError` class, `ErrorCode` enum, and error categories
  - `classifyError()` helper infers error codes from raw error messages
  - Error responses now include structured data (code, category, details) for programmatic client handling
  - `safeHandler` in `index.ts` updated to use structured error classification

- **Input Validation & Safety Bounds:**
  - Content size validation (512 KB max) on `write_note` and `append_note`
  - Batch size validation (100 items max) on `batch_delete` and `batch_move`
  - Pagination limits (500 max) on `list_notes` and `search_notes`
  - Query string length limit (10 KB max) on `search_notes`
  - Constants: `MAX_CONTENT_BYTES`, `MAX_BATCH_SIZE`, `MAX_PAGINATION_LIMIT`, `MAX_QUERY_LENGTH`

- **Improved Consolidation Engine:**
  - New `normalizeToTokens()` function: strips markdown/code blocks, removes stopwords, generates word bigrams
  - Duplicate detection now uses semantic tokenization instead of naive whitespace splitting
  - Better phrase-aware comparison via unigram + bigram token sets

- **New Test Suites:**
  - `errors.test.ts` — 17 tests covering QuillError, classifyError, validateContentSize, validateBatchSize
  - `conflict-engine.test.ts` — 10 tests covering resolveConflict, getSupersessionChain, cycle detection
  - Extended `consolidation.test.ts` — 8 new tests for normalizeToTokens (stopwords, bigrams, markdown stripping, code blocks)

## [1.2.0] - 2026-08-15

### Added

- **Memory Intelligence Layer:**
  - 16 memory types (FACT, DECISION, CONSTRAINT, ARCHITECTURE, LESSON, DISCOVERY, ERROR, SOLUTION, etc.)
  - Lifecycle state machine: ACTIVE -> CONFIRMED -> ARCHIVED with transition validation
  - Resurrection from ARCHIVED requires explicit evidence
  - BM25 smart retrieval with composite scoring (project boost, importance, recency, confidence, graph proximity)
  - Context budget modes: compact (5), standard (20), deep (100)
  - Field-based conflict detection and resolution (supersede, reject, manual_review)
  - Memory consolidation: Jaccard duplicate detection, importance promotion, obsolete archival
  - Checkpoints: structured markdown checkpoints for context reconstruction
  - Audit trail: append-only JSON log of all memory mutations with rotation
  - Secret detection: automatic scanning for API keys/tokens before writes
  - ULID identifiers: time-sortable IDs with `mem_` prefix (Crockford Base32)
  - 14 new `quill_*` tools for memory operations

- **Knowledge Discovery:**
  - Unified `discover` tool: ranked filename/path/metadata/heading/content discovery
  - `search_files`: indexed filename/path substring or glob search
  - `search_by_tag`: YAML tag discovery with AND/OR matching
  - `list_folder`: bounded folder browsing with concise metadata
  - `refresh_knowledge_index`: explicit rebuild of discovery catalog
  - Inverted term index for fast lookups
  - Fuzzy matching via Levenshtein distance with auto-tolerance

- **Hive Canvas:**
  - `generate_hive_canvas`: generates .canvas.json knowledge visualization
  - Auto-regeneration on note changes via `hive-auto-regen`

- **Production Hardening:**
  - Centralized path-security contract: `safeReadTarget`, `safeWriteTarget`, `safeDeleteTarget`
  - Symlink/junction defense on all filesystem operations
  - `safeWalkDir` never follows symbolic links during traversal
  - Case-insensitive vault root protection on Windows/macOS
  - Protected directories: `.trash`, `.git`, `.quill-sessions`, `node_modules`
  - Adversarial test suite: 19+ tool-level security tests with sentinel file integrity
  - Filesystem policy guard script (`check-fs-policy.mjs`)

- **Enhanced Search:**
  - BM25 ranking with inverted index candidate filtering
  - Fuzzy matching (Levenshtein distance)
  - Advanced operators: "exact phrase", tag:value, path:value, -exclude
  - "Did you mean" suggestions on zero results
  - Frontmatter-only mode for fast metadata scanning
  - Wildcard/glob content patterns
  - Snippet extraction with context lines

- **Graph Engine:**
  - BFS shortest path between notes
  - Degree centrality computation
  - Label propagation community detection
  - Orphan and bridge node detection
  - Shared-tag edge inference

## [1.1.0] - 2026-07-24

### Added

- **New Tools:**
  - `append_note` - Append content to existing notes
  - `delete_folder` - Delete folders recursively
  - `copy_note` - Copy notes to new locations
  - `vault_status` - Check vault health and accessibility
  - `batch_delete` - Delete multiple notes at once
  - `batch_move` - Move multiple notes at once
  - `rename_folder` - Rename folders in the vault
  - `extract_tags` - Extract hashtags from notes
  - `search_by_name` - Search notes by filename pattern

- **Enhanced Features:**
  - Regex search support in `search_notes` with `useRegex` parameter
  - Structured logging with configurable log levels
  - Graceful shutdown handling (SIGINT/SIGTERM)
  - Frontmatter parsing utilities

- **Development & Infrastructure:**
  - Vitest testing framework with coverage support
  - ESLint and Prettier for code quality
  - GitHub Actions CI/CD workflow
  - CONTRIBUTING.md for contributor guidelines
  - CHANGELOG.md for version tracking

- **Package Improvements:**
  - Added `dev` script for watch mode development
  - Added `bin` field for global CLI installation
  - Added `engines` field specifying Node.js >= 18.0.0
  - Added keywords for npm discovery
  - Added `prepare` script for build automation

## [1.0.0] - 2026-07-23

### Added

- Initial release
- Core tools: `read_note`, `write_note`, `create_note`, `delete_note`, `move_note`, `list_notes`, `search_notes`, `note_info`, `create_folder`
- Vault path configuration via CLI argument, environment variable, or .env file
- Path traversal protection for security
- Comprehensive README documentation
- MIT License
