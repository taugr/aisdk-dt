# CLI Reference

`aisdk-dt` reads an AI SDK DevTools `generations.json` file and emits bounded JSON or compact text output. With no subcommand, it inspects the latest root run using an LLM-oriented summary.

## Global Options

- `--file <path>`: path to `generations.json`; defaults to `.devtools/generations.json`
- `--max-file-bytes <number>`: maximum database size; defaults to 104,857,600 bytes (100 MiB)
- `--max-output-chars <number>`: maximum total output unless an explicit `--full` is used; minimum 256 and default 32,000
- `--pretty`: pretty-print JSON
- `--text`: compact human-readable output where supported
- `--version`: print the package version

## Default Inspection

Inspect what happened most recently:

```sh
aisdk-dt --file <path>
```

The default output includes latest run metadata, a narrative summary, final
output, compact tool counts, usage, cache usage, step status, timeline spans,
and diagnostics.

## `inspect [runId]`

Inspect a run with tools, usage, diagnostics, and timeline data. Messages are
included only when `--messages <number>` is supplied.
The output includes a `narrative` section with a compact summary, final output,
tool sequence, and diagnosis when available.

Options:

- `--latest`: inspect the latest root run
- `--all`: allow `--latest` to select child runs
- `--messages <number>`: include this many recent non-system messages
- `--include-system`: include system messages in the message section
- `--usage-per-message`: include usage on every rendered message
- `--max-chars <number>`: maximum preview characters
- `--events`: include recent raw stream events for errored runs

```sh
aisdk-dt inspect --latest --file <path>
aisdk-dt inspect <runId> --messages 20 --file <path>
aisdk-dt inspect <runId> --messages 20 --include-system --file <path>
```

## `final [runId]`

Show the final meaningful output for a run with a larger bounded payload.

Options:

- `--latest`: show the final output for the latest root run
- `--all`: allow `--latest` to select child runs
- `--max-chars <number>`: maximum preview characters
- `--full`: emit the complete final output payload

```sh
aisdk-dt final --latest --file <path>
aisdk-dt final <runId> --max-chars 2000 --file <path>
```

## `runs`

List recent runs.

Options:

- `--limit <number>`: number of runs to return
- `--offset <number>`: number of runs to skip
- `--all`: include child runs as well as root runs
- `--children`: include child run IDs
- `--errors`: only include runs with errors
- `--in-progress`: only include unfinished runs
- `--model <model>`: filter runs containing a model id substring
- `--provider <provider>`: filter runs containing a provider substring
- `--function <functionId>`: filter runs by function id substring
- `--since <iso>`: only include runs started at or after this time
- `--until <iso>`: only include runs started at or before this time
- `--json-path <path>`: select a dot/bracket path from the result

```sh
aisdk-dt runs --limit 10 --errors --file <path>
aisdk-dt runs --limit 1 --json-path 'runs[0].id' --text --file <path>
```

## `run [runId]`

Show compact detail for one run.

Options:

- `--latest`: show the latest root run
- `--all`: allow `--latest` to select child runs
- `--include-children`: include nested child runs
- `--timeline`: include timeline spans
- `--max-chars <number>`: maximum preview characters

```sh
aisdk-dt run <runId> --include-children --file <path>
```

## `steps [runId]`

List collapsed step-card summaries for a run.

```sh
aisdk-dt steps <runId> --file <path>
aisdk-dt steps --latest --file <path>
```

## `step <stepId>`

Inspect one step safely.

Options:

- `--section <section>`: `input`, `output`, `config`, `usage`, `raw`, or `all`
- `--field <field>`: raw step field to inspect
- `--json-path <path>`: dot or bracket path inside selected data
- `--max-chars <number>`: maximum preview characters
- `--full`: emit complete selected data

```sh
aisdk-dt step <stepId> --section output --max-chars 800 --file <path>
```

## `messages [runId]`

Extract recent bounded prompt transcript messages. System messages and
per-message usage are omitted by default.

Options:

- `--latest`: inspect the latest root run
- `--all`: allow `--latest` to select child runs
- `--limit <number>`: number of latest messages
- `--role <role>`: filter by `user`, `assistant`, `system`, or `tool`
- `--parts <parts>`: comma-separated `text`, `reasoning`, `tool-calls`, `tool-results`, `attachments`, or `unknown`
- `--include-system`: include system messages
- `--usage-per-message`: include usage on every rendered message
- `--max-chars <number>`: maximum preview characters

```sh
aisdk-dt messages <runId> --limit 12 --max-chars 500 --file <path>
aisdk-dt messages --latest --file <path>
```

## `output <stepId>`

Extract rendered output content for a step.

Options:

- `--text`: include text output
- `--reasoning`: include reasoning output
- `--tools`: include tool calls and paired results
- `--max-chars <number>`: maximum preview characters
- `--full`: emit complete selected data

```sh
aisdk-dt output <stepId> --text --max-chars 800 --file <path>
```

## `tools [targetId]`

Query available tools, tool calls, and tool results for a run or step.
Actual calls/results are shown first by default. Results are labeled as
`paired-next-step` when they answer a tool call from that step, or
`replayed-context` when they are prior context carried into a later step. Text
output includes original, replayed-from, and observed step labels where useful.
Calls that finish at `tool-calls` without a later result are labeled
`terminal-unpaired-call`; when only streamed tool input is available, they are
labeled `reconstructed-terminal-tool-input`.

Options:

- `--latest`: inspect the latest root run
- `--all`: allow `--latest` to select child runs
- `--tool-call-id <id>`: filter by tool call ID
- `--available`: include available tool definitions
- `--available-only`: show only available tool definitions
- `--max-chars <number>`: maximum preview characters
- `--full`: emit complete selected data

```sh
aisdk-dt tools <runOrStepId> --file <path>
aisdk-dt tools --latest --file <path>
aisdk-dt tools <runOrStepId> --available-only --file <path>
```

## `usage [targetId]`

Show token usage for a run or step.

```sh
aisdk-dt usage <runOrStepId> --file <path>
aisdk-dt usage --latest --text --file <path>
```

## `raw <stepId>`

Safely query raw request, response, chunk, provider, or AI SDK payloads.

Options:

- `--request`: select raw request
- `--response`: select raw response
- `--chunks`: select raw chunks
- `--provider`: select provider raw chunks
- `--ai-sdk`: select AI SDK raw response
- `--json-path <path>`: dot or bracket path inside selected raw data
- `--max-chars <number>`: maximum preview characters
- `--full`: emit complete selected data

```sh
aisdk-dt raw <stepId> --request --json-path 'model' --file <path>
aisdk-dt raw <stepId> --response --json-path 'content[0]' --max-chars 800 --file <path>
```

## `timeline [runId]`

Emit trace timeline spans for a run. Reasoning and text content are omitted by
default.

Options:

- `--latest`: inspect the latest root run
- `--all`: allow `--latest` to select child runs
- `--include-content`: include bounded reasoning and text content
- `--max-chars <number>`: maximum preview characters for included content
- `--full`: emit complete timeline content

```sh
aisdk-dt timeline <runId> --file <path>
aisdk-dt timeline --latest --file <path>
aisdk-dt timeline <runId> --include-content --max-chars 500 --file <path>
```

## `events <stepId>`

Summarize raw response or chunk stream events for a step.
The output includes event type counts and a diagnosis for common failure shapes,
such as streamed tool input that never completed or streams with no terminal
event.

Options:

- `--chunks`: inspect raw chunks instead of raw response events
- `--type <type>`: filter events by type
- `--last <number>`: number of last events
- `--max-chars <number>`: maximum preview characters

```sh
aisdk-dt events <stepId> --last 20 --file <path>
aisdk-dt events <stepId> --chunks --type response.created --file <path>
```

## Output Modes

By default, commands emit compact JSON. Use `--pretty` for readable JSON and
`--text` for compact human-readable output where supported. Long values carry
explicit `preview`, `truncated`, and original `chars` metadata. Arrays report
omitted item counts, and a final valid-JSON fallback is used if the configured
total output budget is reached.
