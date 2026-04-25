# Contributing to aisdk-dt

Thanks for contributing.

## Setup

Requirements:

- Node.js 20+
- `pnpm` 10+

Clone the repo and install dependencies:

```bash
git clone https://github.com/tom-auger/aisdk-dt.git
cd aisdk-dt
pnpm install
```

This repo is a small CLI package:

- the CLI entrypoint lives at `src/cli.ts`
- generation parsing and summarization helpers live at `src/generations.ts`
- shared types live at `src/types.ts`
- the agent skill lives at `.agents/skills/aisdk-dt-inspector/`

## Common Commands

```bash
pnpm run test
pnpm run lint
pnpm run format
pnpm run build
```

Useful variants:

```bash
pnpm run lint:fix
pnpm run format:fix
pnpm run test:watch
```

## Workflow

1. Make changes under `src/` and add or update focused tests under `tests/`.
2. If the change affects agent usage, update `.agents/skills/aisdk-dt-inspector/SKILL.md`.
3. Run the narrowest relevant test first, then `pnpm run test`.
4. Run `pnpm run build` for CLI changes.
5. Update `README.md` when user-facing commands, installation, or workflows change.

## Testing

Tests live under `tests/`.

Run the full suite:

```bash
pnpm run test
```

## Pull Requests

- Keep changes focused.
- Add tests for behavior changes.
- Prefer updating documentation in the same PR when user-facing behavior changes.
- Keep the README and bundled skill aligned when command workflows change.

## Questions

Open an issue at [github.com/tom-auger/aisdk-dt/issues](https://github.com/tom-auger/aisdk-dt/issues).
