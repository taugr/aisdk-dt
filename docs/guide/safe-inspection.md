# Safe Inspection

`generations.json` can contain sensitive prompts, raw provider payloads, tool arguments, tool results, response chunks, and reasoning-like content. `aisdk-dt` is designed to help agents inspect that data deliberately.

## Start With Inspection

The default command is designed for coding agents and LLM context. It inspects
the latest root run with tool calls, tool results, step status, usage, cache
usage, timeline data, a narrative summary, final output, and diagnostics. Add
`--messages <number>` when recent transcript messages are needed.

```sh
aisdk-dt --file <path>
aisdk-dt inspect --latest --file <path>
```

Inspect a specific run when needed:

```sh
aisdk-dt inspect <runId> --file <path>
```

## Drill Down Semantically

Prefer semantic commands first:

```sh
aisdk-dt runs --limit 10 --file <path>
aisdk-dt inspect <runId> --messages 12 --max-chars 500 --file <path>
aisdk-dt messages <runId> --limit 12 --max-chars 500 --file <path>
aisdk-dt steps <runId> --file <path>
aisdk-dt output <stepId> --max-chars 800 --file <path>
aisdk-dt tools <runOrStepId> --file <path>
aisdk-dt usage <runOrStepId> --file <path>
aisdk-dt events <stepId> --last 20 --file <path>
```

These commands summarize the data without dumping every raw field.

## Bound Large Content

All commands have a 32,000-character total-output guard by default, configurable
with `--max-output-chars`. Use the narrower command-level `--max-chars` whenever
output may include:

- prompts
- assistant output
- reasoning
- tool arguments
- tool results
- raw requests
- raw responses
- raw chunks
- provider payloads

## Prefer JSON Paths

When raw payloads are necessary, select the smallest useful field:

```sh
aisdk-dt raw <stepId> --request --json-path 'model' --file <path>
aisdk-dt raw <stepId> --response --json-path 'content[0]' --max-chars 800 --file <path>
```

Use `--full` only for deliberate local inspection.

## What Each Command Can Reveal

| Command                          | Sensitive content that can appear                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `runs`, `steps`, `usage`         | Metadata, IDs, model/provider names, counts, timing, token usage, and short first-message summaries    |
| default `inspect`                | Bounded final output, tool arguments/results, diagnostics, and metadata; prompt messages remain opt-in |
| `inspect --messages`, `messages` | Prompt transcript text and content-part metadata                                                       |
| `output`, `final`                | Assistant text, reasoning, objects, tool arguments, and tool results                                   |
| `tools`                          | Tool definitions, arguments, and results                                                               |
| `events`                         | Bounded raw stream event values                                                                        |
| `timeline`                       | Timing and labels only by default; text/reasoning with `--include-content`                             |
| `raw`                            | Selected raw request, response, chunk, or provider data                                                |

Known images/files are represented by metadata such as media type and filename;
unknown content is marked `unsupported: true`. The CLI does not intentionally
render binary attachment data in semantic message summaries.

## Pass Absolute Paths Across Repos

When the agent is not running from the app that produced the DevTools file, pass an absolute path:

```sh
aisdk-dt --file /absolute/path/to/.devtools/generations.json
```

This avoids accidentally inspecting a different repo's `.devtools/generations.json`.

## Be Careful In Reports

Do not copy sensitive prompt, request, response, or provider payload content into final answers unless the user explicitly asks for it.

Prefer summaries like:

- which run failed
- which step failed
- which tool call was involved
- what class of provider error occurred
- which command would reveal more detail locally
