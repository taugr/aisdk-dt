# aisdk-dt

<p align="center">
  <img src="./docs/public/logo.svg" alt="aisdk-dt logo" width="160" />
  <br />
  <a href="https://www.npmjs.com/package/aisdk-dt">
    <img src="https://img.shields.io/npm/v/aisdk-dt" alt="npm version" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/npm/l/aisdk-dt" alt="license" />
  </a>
  <br />
  CLI for querying AI SDK DevTools <code>generations.json</code> files so your coding agent can inspect Vercel AI SDK requests, responses, tool calls, and usage without flooding context.
</p>

> `aisdk-dt` is an independent package and is not affiliated with, endorsed by, or maintained by Vercel.

## Features

- 🔎 List, filter, and inspect AI SDK DevTools runs
- ✂️ Extract bounded prompt messages, outputs, tool calls, and token usage
- 🧭 Query raw request, response, chunk, and provider payloads with previews and JSON paths
- ⏱️ Summarize timing for multi-step and nested generations
- 🛡️ Provide an agent skill for safe `generations.json` inspection workflows

## Installation

Install the `aisdk-dt` binary globally:

With pnpm:

```bash
pnpm add -g aisdk-dt
```

With npm:

```bash
npm install -g aisdk-dt
```

Or run it without installing:

With pnpm:

```bash
pnpx aisdk-dt runs --file .devtools/generations.json
```

With npm:

```bash
npx aisdk-dt runs --file .devtools/generations.json
```

Or install it locally as a dev dependency:

With pnpm:

```bash
pnpm add -D aisdk-dt
```

With npm:

```bash
npm install -D aisdk-dt
```

This package requires Node.js 20 or newer.

## Set Up AI SDK DevTools

`aisdk-dt` reads the DevTools `generations.json` file produced by the Vercel AI SDK.

If you have not enabled DevTools yet, follow the official setup guide first:

- https://ai-sdk.dev/docs/ai-sdk-core/devtools

After setup, run your app once and confirm a `.devtools/generations.json` file exists in your project (or note the custom output path you configured).

## Quick Start

For most workflows, start with the skill and your preferred coding LLM agent instead of running raw CLI commands yourself.

This repo includes an agent skill in `.agents/skills/aisdk-dt-inspector/` for safe inspection of large AI SDK DevTools generation logs without pulling full prompts, raw provider payloads, or streamed chunks into context.

Install the `aisdk-dt-inspector` skill:

```bash
npx skills add taugr/aisdk-dt --skill aisdk-dt-inspector
```

Point your agent at the `generations.json` file and ask it to inspect or summarize a run:

```text
Use $aisdk-dt-inspector to inspect .devtools/generations.json and summarize failed runs from today.
```

## Updating

If you installed `aisdk-dt` globally, update it with the same package manager:

With pnpm:

```bash
pnpm add -g aisdk-dt@latest
```

With npm:

```bash
npm install -g aisdk-dt@latest
```

If you installed it locally in a project:

With pnpm:

```bash
pnpm update aisdk-dt
```

With npm:

```bash
npm update aisdk-dt
```

If you use `npx` or `pnpx`, you usually do not need to update anything manually; they resolve the package when run.

## Direct CLI Usage

Use direct CLI commands when you need manual or scripted inspection.

Point the CLI at a DevTools database:

```bash
aisdk-dt runs --file .devtools/generations.json --limit 10
```

Inspect a run:

```bash
aisdk-dt run <runId> --file .devtools/generations.json --pretty
```

List its steps:

```bash
aisdk-dt steps <runId> --file .devtools/generations.json --text
```

Extract bounded messages and output:

```bash
aisdk-dt messages <runId> --file .devtools/generations.json --limit 6 --max-chars 500
aisdk-dt output <stepId> --file .devtools/generations.json --text --max-chars 800
```

Check tool calls and token usage:

```bash
aisdk-dt tools <runOrStepId> --file .devtools/generations.json
aisdk-dt usage <runOrStepId> --file .devtools/generations.json
```

If you run commands from the project that produced the file, `--file` defaults to `.devtools/generations.json`.

## Example Project

Want a concrete, end-to-end demo? Start with this first example:

- [`examples/simple-chatbot`](./examples/simple-chatbot/README.md): a Next.js chatbot with AI SDK tool calls, AI SDK DevTools capture, and `aisdk-dt` inspection commands.

## Command Overview

Global options:

- `--file <path>`: path to `generations.json`; defaults to `.devtools/generations.json`
- `--max-file-bytes <number>`: refuse unexpectedly large database files; defaults to 100 MiB
- `--max-output-chars <number>`: bound total output; minimum 256 and default 32,000 characters unless a command uses `--full`
- `--pretty`: pretty-print JSON output
- `--text`: render compact human-readable output where supported
- `--version`: report the installed package version

List recent runs:

```bash
aisdk-dt runs
```

Select the newest run ID for a script:

```bash
RUN_ID=$(aisdk-dt runs --limit 1 --json-path 'runs[0].id' --text)
```

Useful `runs` filters:

- `--limit <number>` and `--offset <number>`
- `--all` to include child runs
- `--children` to include child run IDs
- `--errors` for failed runs
- `--in-progress` for unfinished runs
- `--model <model>`, `--provider <provider>`, and `--function <functionId>`
- `--since <iso>` and `--until <iso>`
- `--json-path <path>` to select a field from the result

Show compact run detail:

```bash
aisdk-dt run <runId>
```

Use `--include-children` for nested runs and `--timeline` for trace spans.

Inspect steps:

```bash
aisdk-dt steps <runId>
aisdk-dt step <stepId>
```

`step` supports `--section input`, `output`, `config`, `usage`, `raw`, or `all`. Use `--field <field>` and `--json-path <path>` when you need a narrow raw field.

Extract prompt messages and model output:

```bash
aisdk-dt messages <runId> --limit 6 --max-chars 500
aisdk-dt output <stepId> --text --max-chars 800
```

`messages` reconstructs a deterministic transcript from cumulative prompts and
can filter by `--role` and `--parts`. Supported parts include `attachments` and
`unknown`, so newer AI SDK content remains inspectable without exposing binary
payloads. `output` can include `--text`, `--reasoning`, and `--tools`.

Query tools and usage:

```bash
aisdk-dt tools <runOrStepId>
aisdk-dt usage <runOrStepId>
```

`tools` includes terminal unpaired calls when a model step finishes with
`tool-calls` and no later tool result is present.

Query raw payloads only when the semantic commands do not answer the question:

```bash
aisdk-dt raw <stepId> --request --json-path 'model'
aisdk-dt raw <stepId> --response --json-path 'content[0]' --max-chars 800
```

Raw selectors:

- `--request`
- `--response`
- `--chunks`
- `--provider`
- `--ai-sdk`

Emit timeline spans:

```bash
aisdk-dt timeline <runId>
```

Timeline content is omitted by default. Add `--include-content --max-chars 500`
for bounded text/reasoning or use `--full` only for deliberate local access.

## Output and Privacy Contract

Default JSON is structurally bounded: long strings become
`{"preview":"...","truncated":true,"chars":1234}`, long arrays include omitted
item counts, and total output is capped by `--max-output-chars`. A `--full`
option bypasses the total cap only on commands that explicitly offer it.

`runs`, `steps`, `usage`, and the default timeline avoid full prompt or raw
payload content. `messages`, `output`, `tools`, `events`, `raw`,
`timeline --include-content`, and any `--full` option can expose sensitive local
data. Treat generated output as private unless it has been reviewed.

## Safe Inspection Workflow

Start with bounded semantic commands:

```bash
aisdk-dt runs --limit 10 --file <path>
aisdk-dt messages <runId> --limit 6 --max-chars 500 --file <path>
aisdk-dt steps <runId> --file <path>
aisdk-dt output <stepId> --max-chars 800 --file <path>
```

Use raw data deliberately:

- Prefer `messages`, `steps`, `output`, `tools`, and `usage` before `raw`
- Use `--max-chars` whenever output may include prompts, reasoning, tool arguments, tool results, raw requests, raw responses, or raw chunks
- Use `raw --json-path` before `raw --full`
- When working outside the project that produced the file, pass `--file /absolute/path/to/generations.json`
- Do not copy sensitive prompt, request, response, or provider payload content into reports unless the user explicitly asks for it

## Development

```bash
pnpm install
pnpm run test
pnpm run build
pnpm run test:package
```

See the [full documentation](https://taugr.github.io/aisdk-dt/) for
compatibility, troubleshooting, and development benchmarks.

Upgrading from 0.1? Review the
[0.2 migration guide](https://taugr.github.io/aisdk-dt/guide/migrating-to-0.2).

## Project

- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)
- [License](./LICENSE)
