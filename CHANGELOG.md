# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
