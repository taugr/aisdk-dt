# Getting Started

`aisdk-dt` lets your coding agent inspect AI SDK DevTools `generations.json` files without loading huge prompts, raw responses, or stream chunks into context.

## 1. Enable AI SDK DevTools

`aisdk-dt` depends on the `generations.json` file created by AI SDK DevTools.

If you have not set this up yet, use the official guide first:

- https://ai-sdk.dev/docs/ai-sdk-core/devtools

After enabling DevTools, run your app and confirm `.devtools/generations.json` exists (or identify your configured output path).

## 2. Install The CLI

Install the `aisdk-dt` binary globally:

```sh
pnpm add -g aisdk-dt
npm install -g aisdk-dt
```

Or run it without installing:

```sh
pnpx aisdk-dt runs --file .devtools/generations.json
npx aisdk-dt runs --file .devtools/generations.json
```

Or install it locally as a dev dependency:

```sh
pnpm add -D aisdk-dt
```

`aisdk-dt` requires Node.js 20 or newer.

## 3. Install The Agent Skill

Install the bundled skill with skills.sh:

```sh
npx skills add tom-auger/aisdk-dt --skill aisdk-dt-inspector
```

Then call the skill by name when you want your agent to inspect DevTools data:

```text
Use $aisdk-dt-inspector to inspect .devtools/generations.json and summarize the failed run.
```

The skill tells agents to prefer bounded semantic commands before raw payloads.

## 4. Point It At A DevTools File

From the app that produced the DevTools file, `aisdk-dt` defaults to:

```text
.devtools/generations.json
```

From another directory, pass an explicit path:

```sh
aisdk-dt runs --file /absolute/path/to/generations.json
```

## 5. First Agent Workflow

Start with recent runs:

```sh
aisdk-dt runs --limit 10 --file <path>
```

Inspect the prompt transcript:

```sh
aisdk-dt messages <runId> --limit 6 --max-chars 500 --file <path>
```

List steps for the run:

```sh
aisdk-dt steps <runId> --file <path>
```

Inspect a step output:

```sh
aisdk-dt output <stepId> --max-chars 800 --file <path>
```

## 6. When To Use Raw Payloads

Use raw payloads when the bounded message, output, tool, and usage commands do not answer the question.

```sh
aisdk-dt raw <stepId> --request --json-path 'model' --file <path>
aisdk-dt raw <stepId> --response --json-path 'content[0]' --max-chars 800 --file <path>
```

Prefer `--json-path` and `--max-chars` before `--full`.

## Next Steps

- [Agent Skill](/guide/agent-skill)
- [Workflows](/guide/workflows)
- [CLI Reference](/guide/commands)
- [Safe Inspection](/guide/safe-inspection)
- [Example Chatbot (repo)](https://github.com/tom-auger/aisdk-dt/tree/main/examples/simple-chatbot)
