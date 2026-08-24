# Contributing to quill-mcp

Thank you for your interest in contributing to quill-mcp! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions.

## Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/quill-mcp.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development Workflow

### Building

```bash
npm run build
```

### Running in Development Mode

```bash
npm run dev
```

This starts TypeScript in watch mode, automatically recompiling on changes.

### Testing

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

### Linting

```bash
npm run lint
```

Auto-fix linting issues:

```bash
npm run lint:fix
```

### Formatting

```bash
npm run format
```

Check formatting:

```bash
npm run format:check
```

## Adding New Tools

1. Create a new file in `src/tools/` following the existing pattern
2. Export `name`, `description`, `inputSchema`, and `handler`
3. Register the tool in `src/index.ts`
4. Add tests in `src/tools/your-tool.test.ts`
5. Update the README with the new tool documentation

## Pull Request Process

1. Update the README.md with details of changes if applicable
2. Ensure all tests pass and linting is clean
3. Follow the conventional commits specification for commit messages
4. Submit your pull request

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

## Questions?

Feel free to open an issue for questions or discussions.
