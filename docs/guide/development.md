# Development

## Setup

```sh
pnpm install
```

Requirements:

- Node.js 22.18+, 24.11+, or 26+ for workspace development. The published `aisdk-dt` CLI still supports Node.js 20+.
- Corepack, using the project-pinned `pnpm` version

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
`AISDK_DT_BENCHMARK_ITERATIONS`. Set `AISDK_DT_BENCHMARK_BASELINE_CLI` to an
older built CLI entrypoint to include before/after measurements.

On the 2026-07-24 release benchmark, a 2,000-run/8,000-step database was
22.9 MB. Comparing 0.2.0 with the published 0.1.3 CLI over two measured
iterations:

| Command                        |    0.1.3 |    0.2.0 |      Change |
| ------------------------------ | -------: | -------: | ----------: |
| `runs --limit 10`              | 294.9 ms | 126.1 ms | 2.3x faster |
| `inspect run-1999`             | 119.3 ms | 135.0 ms |        0.9x |
| `messages run-1999 --limit 12` | 129.1 ms | 132.0 ms |        1.0x |
| `tools run-1999`               | 115.8 ms | 126.8 ms |        0.9x |
| `usage run-1999`               | 115.3 ms | 136.9 ms |        0.8x |
| `timeline run-1999`            | 125.7 ms | 125.1 ms |        1.0x |

The index materially improves broad run listing. Targeted single-run commands
remain dominated by full-file read and schema validation, with roughly flat to
modestly slower subprocess times after the additional safety checks in 0.2.0.
Streaming parsing was not adopted without stronger evidence that its added
complexity would improve those end-to-end paths.

## Project Documents

- [Contributing](https://github.com/taugr/aisdk-dt/blob/main/CONTRIBUTING.md)
- [Security](https://github.com/taugr/aisdk-dt/blob/main/SECURITY.md)
- [License](https://github.com/taugr/aisdk-dt/blob/main/LICENSE)
