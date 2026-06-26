# Development

## Setup

```sh
pnpm install
```

Requirements:

- Node.js 22+ for workspace development. The published `aisdk-dt` CLI still supports Node.js 20+.
- `pnpm` 10+

## Commands

```sh
pnpm run format
pnpm run lint
pnpm run test
pnpm run build
```

For local docs development:

```sh
pnpm run docs:dev
pnpm run docs:build
pnpm run docs:preview
```

## Project Shape

- `src/cli.ts`: CLI entrypoint
- `src/generations.ts`: parsing and summarization helpers
- `src/schema.ts`: runtime validation schemas
- `src/types.ts`: shared types
- `.agents/skills/aisdk-dt-inspector/`: bundled agent skill
- `docs/`: VitePress documentation site

## Hooks

This repo uses Husky and lint-staged. The pre-commit hook runs `oxfmt` on staged files.

## Publishing

`pnpm run build` uses `tsdown` to produce the CLI bundle at `dist/cli.js`.

The package publishes:

- `dist`
- `.agents/skills/aisdk-dt-inspector/SKILL.md`

## Project Documents

- [Contributing](https://github.com/taugr/aisdk-dt/blob/main/CONTRIBUTING.md)
- [Security](https://github.com/taugr/aisdk-dt/blob/main/SECURITY.md)
- [License](https://github.com/taugr/aisdk-dt/blob/main/LICENSE)
