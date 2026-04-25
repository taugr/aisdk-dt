# CLI Reference

`aisdk-dt` reads an AI SDK DevTools `generations.json` file and emits bounded JSON or compact text output.

## Global Options

- `--file <path>`: path to `generations.json`; defaults to `.devtools/generations.json`
- `--pretty`: pretty-print JSON
- `--text`: compact human-readable output where supported

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

```sh
aisdk-dt runs --limit 10 --errors --file <path>
```

## `run <runId>`

Show compact detail for one run.

Options:

- `--include-children`: include nested child runs
- `--timeline`: include timeline spans
- `--max-chars <number>`: maximum preview characters

```sh
aisdk-dt run <runId> --include-children --file <path>
```

## `steps <runId>`

List collapsed step-card summaries for a run.

```sh
aisdk-dt steps <runId> --file <path>
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

## `messages <runId>`

Extract bounded prompt transcript messages.

Options:

- `--limit <number>`: number of latest messages
- `--role <role>`: filter by `user`, `assistant`, `system`, or `tool`
- `--parts <parts>`: comma-separated parts, such as `text`, `reasoning`, `tool-calls`, or `tool-results`
- `--max-chars <number>`: maximum preview characters

```sh
aisdk-dt messages <runId> --limit 6 --max-chars 500 --file <path>
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

## `tools <targetId>`

Query available tools, tool calls, and tool results for a run or step.

Options:

- `--tool-call-id <id>`: filter by tool call ID
- `--max-chars <number>`: maximum preview characters
- `--full`: emit complete selected data

```sh
aisdk-dt tools <runOrStepId> --file <path>
```

## `usage <targetId>`

Show token usage for a run or step.

```sh
aisdk-dt usage <runOrStepId> --file <path>
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

## `timeline <runId>`

Emit trace timeline spans for a run.

```sh
aisdk-dt timeline <runId> --file <path>
```

## Output Modes

By default, commands emit compact JSON. Use `--pretty` for readable JSON and `--text` for compact human-readable output where supported.
