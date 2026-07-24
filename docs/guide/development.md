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
pnpm run test:package
pnpm run benchmark
```

For local docs development:

```sh
pnpm run docs:dev
pnpm run docs:build
pnpm run docs:preview
```

## Project Shape

- `src/cli.ts`: minimal executable entrypoint
- `src/program.ts`: command definitions and output wiring
- `src/generations.ts`: loading, indexes, parsing, and summarization helpers
- `src/output-policy.ts`: structural and total-output bounds
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

## Performance

`pnpm run benchmark` generates a synthetic database with high step counts,
nested runs, tool data, and 2,000-character raw payloads. Override its size with
`AISDK_DT_BENCHMARK_RUNS`, `AISDK_DT_BENCHMARK_STEPS`, and
`AISDK_DT_BENCHMARK_ITERATIONS`.

On the 2026-07-24 development run, a 2,000-run/8,000-step database was 22.9 MB.
Warm subprocess measurements for `runs`, `inspect`, `messages`, `tools`,
`usage`, and `timeline` were 124–127 ms (two measured iterations). Query
indexes and per-step parse caches made query work small relative to full-file
read/schema validation, so streaming parsing was not adopted without stronger
evidence.

## Project Documents

- [Contributing](https://github.com/taugr/aisdk-dt/blob/main/CONTRIBUTING.md)
- [Security](https://github.com/taugr/aisdk-dt/blob/main/SECURITY.md)
- [License](https://github.com/taugr/aisdk-dt/blob/main/LICENSE)
