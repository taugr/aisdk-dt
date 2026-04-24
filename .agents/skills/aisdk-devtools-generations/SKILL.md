---
name: aisdk-devtools-generations
description: Use when inspecting or querying AI SDK DevTools generations.json files, large generation logs, transcripts, tool calls, raw request/response payloads, raw chunks, provider options, or token usage through the aisdk-dt CLI.
---

# AI SDK DevTools Generations

Use `aisdk-dt` to inspect `generations.json` without pulling huge prompts,
provider payloads, or raw chunks into context.

## Default Workflow

1. Start by finding candidate runs.

   ```bash
   aisdk-dt runs --limit 10 --file <path>
   ```

2. Prefer bounded semantic queries before raw payloads.

   ```bash
   aisdk-dt messages <runId> --limit 6 --max-chars 500 --file <path>
   aisdk-dt steps <runId> --file <path>
   aisdk-dt output <stepId> --max-chars 800 --file <path>
   aisdk-dt tools <runOrStepId> --file <path>
   aisdk-dt usage <runOrStepId> --file <path>
   ```

3. Use raw data only when the semantic commands do not answer the question.

   ```bash
   aisdk-dt raw <stepId> --request --json-path 'model' --file <path>
   aisdk-dt raw <stepId> --response --json-path 'content[0]' --max-chars 800 --file <path>
   ```

## Guardrails

- Prefer `messages`, `steps`, `output`, `tools`, and `usage` before `raw`.
- Use `--max-chars` whenever output could include prompts, reasoning, tool
  arguments, tool results, raw requests, raw responses, or raw chunks.
- Use `raw --json-path` before `raw --full`; quote JSON paths that contain
  brackets, such as `'input[0].content'`.
- Treat `--full` as a last resort for deliberate local inspection, not as
  default agent context.
- When working outside the project that produced the file, always pass
  `--file /absolute/path/to/generations.json`.
- Do not copy sensitive prompt, request, response, or provider payload content
  into final answers unless the user explicitly asks for it.

## Command Selection

- Need recent activity: `runs`.
- Need what happened in a run: `messages`, then `steps`.
- Need the assistant response or object output: `output`.
- Need tool definitions, calls, arguments, or results: `tools`.
- Need token/caching details: `usage`.
- Need provider wire payloads or stream chunks: `raw` with a narrow
  `--json-path`.
- Need timing/nested call structure: `timeline`.
