# What Is `aisdk-dt`?

`aisdk-dt` is a CLI for querying AI SDK DevTools `generations.json` files so coding agents can inspect Vercel AI SDK requests, responses, tool calls, and usage without pulling huge payloads into context.

> `aisdk-dt` is an independent package and is not affiliated with, endorsed by, or maintained by Vercel.

## The Mental Model

AI SDK DevTools records model activity in `generations.json`. That file can contain large prompts, raw provider payloads, tool arguments, tool results, response chunks, and token usage.

`aisdk-dt` gives a coding agent small, targeted commands over that file:

- find the relevant run
- inspect messages and outputs with bounded previews
- check tool calls, tool results, and token usage
- query raw payloads only when necessary

The goal is not to replace the DevTools UI. The goal is to give coding agents a safe local interface for debugging AI SDK behavior from the terminal.

## Recommended Flow

Start with semantic commands:

```sh
aisdk-dt runs --limit 10 --file <path>
aisdk-dt messages <runId> --limit 6 --max-chars 500 --file <path>
aisdk-dt steps <runId> --file <path>
aisdk-dt output <stepId> --max-chars 800 --file <path>
```

Use raw payload commands only after the semantic commands do not answer the question.

Continue to [Getting Started](/guide/getting-started) to install the CLI and the agent skill.
