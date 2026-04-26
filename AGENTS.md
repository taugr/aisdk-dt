# AGENTS.md

Guidance for coding agents working in this repository.

## Repo Overview

- Package manager: `pnpm`
- Runtime baseline: Node.js 20+
- Project type: TypeScript CLI package (`aisdk-dt`)
- Workspace layout:
  - `src/`: CLI commands, argument parsing, generation inspection logic
  - `tests/`: Vitest test suite
  - `.agents/skills/aisdk-dt-inspector/`: bundled skill for safe `generations.json` inspection
  - `examples/simple-chatbot/`: Next.js AI SDK DevTools example app
  - `docs/`: VitePress docs site

This repository publishes a CLI for querying AI SDK DevTools `generations.json` files with bounded, inspection-first workflows.

## What Matters Here

- `aisdk-dt` should help users inspect runs, steps, messages, outputs, tool calls, usage, and raw payloads without flooding context.
- Bounded output behavior (`--limit`, `--max-chars`, `--json-path`, `--text`) is central to safe usage.
- The included skill (`aisdk-dt-inspector`) should stay aligned with CLI behavior and safety guidance.
- User-facing command behavior belongs in tests and docs when changed.

## Common Commands

Install dependencies:

```bash
pnpm install
```

Core validation:

```bash
pnpm run test
pnpm run lint
pnpm run format
pnpm run build
```

Useful fix/dev variants:

```bash
pnpm run lint:fix
pnpm run format:fix
pnpm run test:watch
pnpm run docs:dev
pnpm run docs:build
```

Example app commands:

```bash
pnpm --filter aisdk-dt-example-chatbot run dev
pnpm --filter aisdk-dt-example-chatbot run build
pnpm --filter aisdk-dt-example-chatbot run devtools
```

## Expected Workflow

1. Read affected command handlers/helpers and nearby tests before editing.
2. Keep runtime behavior changes focused in `src/`.
3. Add/update tests in `tests/` for behavior changes.
4. If command UX or safety guidance changes, update `README.md` and docs in the same PR when practical.
5. If inspection workflow guidance changes, update `.agents/skills/aisdk-dt-inspector/SKILL.md`.

## Change Guidance

- Prefer minimal, backward-compatible CLI changes unless the task explicitly requests a break.
- Preserve semantic command-first inspection (`runs`, `run`, `steps`, `messages`, `output`, `tools`, `usage`) before raw extraction.
- Keep raw payload access deliberate and bounded (prefer `--json-path` and `--max-chars`).
- Avoid adding dependencies unless clearly necessary.
- Do not commit generated output directories or local artifacts unless explicitly requested.

## Testing Guidance

- Tests live in `tests/*.test.ts`.
- For focused command/logic changes, run relevant tests first, then full validation:

```bash
pnpm run test
pnpm run lint
pnpm run build
```

- For docs-only changes, run only what is relevant and report what was/was not executed.

## Example App Guidance

- The example app lives at `examples/simple-chatbot` and is a Next.js App Router app that exercises AI SDK `generateText`, tools, and AI SDK DevTools capture.
- The example requires `OPENAI_API_KEY` for successful chat requests. Use `examples/simple-chatbot/.env.example` as the template and do not commit real keys or populated `.env*` files.
- The example dev script uses `NEXT_DIST_DIR=.next-dev` and clears `.next-dev` before starting. Keep that separate from production `.next` output; stale dev route manifests caused pages and API routes to return 404 after `next build`.
- Build the local CLI before inspecting captured DevTools output from a clone:

```bash
pnpm --filter aisdk-dt run build
```

- To verify the example without an API key, run `pnpm --filter aisdk-dt-example-chatbot run build`, start the dev server, open the rendered page, and confirm `POST /api/chat` returns the expected missing-key error.
- To fully verify the chat/tool path, provide `OPENAI_API_KEY`, start the example app with `pnpm --filter aisdk-dt-example-chatbot run dev`, submit a prompt, confirm `.devtools/generations.json` is created, then inspect it with bounded commands such as:

```bash
pnpm --filter aisdk-dt-example-chatbot exec aisdk-dt runs --file examples/simple-chatbot/.devtools/generations.json --limit 10 --pretty
pnpm --filter aisdk-dt-example-chatbot exec aisdk-dt tools --file examples/simple-chatbot/.devtools/generations.json --pretty
```

- If port `3000` is already in use, Next may choose another local port. Report the actual URL used for browser verification.
- The example can emit local watcher warnings such as `EMFILE: too many open files, watch`; distinguish those environment warnings from build, route, or UI regressions.

## File-Specific Notes

- `src/cli.ts`: command definitions and CLI wiring
- `src/generations.ts`: read/query/summarize generation data
- `src/schema.ts`: schema validation/parsing
- `src/types.ts`: shared types
- `README.md`: user-facing install/usage and command examples
- `examples/simple-chatbot/.env.example`: required env template for the example app
- `examples/simple-chatbot/next.config.js`: allows dev to use `.next-dev` while production builds use `.next`
- `examples/simple-chatbot/app/api/chat/route.js`: example AI SDK route with tools and DevTools middleware
- `examples/simple-chatbot/app/page.jsx`: example browser UI
- `.agents/skills/aisdk-dt-inspector/SKILL.md`: agent workflow for safe inspection

## Agent Rules

- Prefer `rg` for search and `rg --files` for file discovery.
- Follow existing TypeScript patterns in touched modules.
- Do not wrap imports in `try/catch`.
- Never commit secrets, tokens, or local environment values.
- Before finishing, report exactly which verification commands were run and whether they passed.
