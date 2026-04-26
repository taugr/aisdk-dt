# AI SDK + DevTools + aisdk-dt Example (Next.js Tool-Calling Chatbot)

This example is a **Next.js app** (App Router) that:

1. Sends chat prompts from a browser UI.
2. Calls an AI SDK API route with two tools (`getWeather`, `listCityActivities`).
3. Captures runs/steps in `.devtools/generations.json` via AI SDK DevTools middleware.
4. Shows how to inspect those runs with an LLM skill first, then with `aisdk-dt` commands.

## Prerequisites

- Node.js 20+
- `OPENAI_API_KEY` in your environment

## Install

From the repository root:

```bash
pnpm install
```

## Run the Next.js app

From this example directory:

```bash
pnpm dev
```

Open <http://localhost:3000> and ask things like:

- `What should I do in Seattle this afternoon?`
- `Suggest outdoor plans for Austin today.`

Each prompt hits `POST /api/chat`, where `generateText` can call tools and DevTools records the full generation flow.

## Open the DevTools viewer

In a second terminal (same directory):

```bash
pnpm devtools
```

Then open <http://localhost:4983>.

## Inspect with an LLM agent + skill (first workflow)

Use the bundled `aisdk-dt-inspector` skill first, then fall back to manual CLI commands when needed.

Install the skill once:

```bash
npx skills add tom-auger/aisdk-dt --skill aisdk-dt-inspector
```

Then ask your coding agent to inspect this example's DevTools file:

```text
Use $aisdk-dt-inspector to inspect examples/simple-chatbot/.devtools/generations.json. Summarize the latest run, list tool calls, and report token usage.
```

This is usually the fastest path when you want an LLM to investigate runs safely with bounded output.

## Inspect with aisdk-dt

> If you are running this example from a clone of this repo, build the local CLI once first:
>
> ```bash
> pnpm --filter aisdk-dt run build
> ```

Once you have sent at least one prompt in the UI:

```bash
pnpm inspect:runs
```

Inspect tool calls for the latest run:

```bash
RUN_ID=$(pnpm exec aisdk-dt runs --file .devtools/generations.json --limit 1 --json-path 'items[0].id' --text)
pnpm exec aisdk-dt tools "$RUN_ID" --file .devtools/generations.json --pretty
```

Inspect usage for that same run:

```bash
pnpm exec aisdk-dt usage "$RUN_ID" --file .devtools/generations.json --pretty
```

## Notes

- DevTools is for local development only.
- `.devtools` data may include prompts, outputs, and tool arguments/results. Avoid sharing raw logs publicly.
