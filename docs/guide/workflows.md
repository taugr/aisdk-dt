# Workflows

These workflows are intended for coding agents inspecting an AI SDK DevTools `generations.json` file.

## Find Recent Runs

```sh
aisdk-dt runs --limit 10 --file <path>
```

Include child runs:

```sh
aisdk-dt runs --all --children --limit 20 --file <path>
```

## Find Failed Or In-Progress Runs

```sh
aisdk-dt runs --errors --file <path>
aisdk-dt runs --in-progress --file <path>
```

## Inspect One Run

```sh
aisdk-dt run <runId> --file <path>
```

Include nested child runs and trace spans:

```sh
aisdk-dt run <runId> --include-children --timeline --file <path>
```

## Read The Prompt Transcript

```sh
aisdk-dt messages <runId> --limit 6 --max-chars 500 --file <path>
```

Filter by role:

```sh
aisdk-dt messages <runId> --role user --max-chars 500 --file <path>
```

## Inspect Outputs

List the steps first:

```sh
aisdk-dt steps <runId> --file <path>
```

Then inspect one step:

```sh
aisdk-dt output <stepId> --text --max-chars 800 --file <path>
```

Include reasoning or tools only when needed:

```sh
aisdk-dt output <stepId> --reasoning --max-chars 800 --file <path>
aisdk-dt output <stepId> --tools --max-chars 800 --file <path>
```

## Inspect Tool Calls And Results

```sh
aisdk-dt tools <runOrStepId> --file <path>
```

Filter to one tool call:

```sh
aisdk-dt tools <runOrStepId> --tool-call-id <toolCallId> --file <path>
```

## Check Token Usage

```sh
aisdk-dt usage <runOrStepId> --file <path>
```

Use this when debugging cost, cache behavior, or unexpectedly large prompts.

## Query Raw Payloads

Start with a narrow JSON path:

```sh
aisdk-dt raw <stepId> --request --json-path 'model' --file <path>
aisdk-dt raw <stepId> --response --json-path 'content[0]' --max-chars 800 --file <path>
```

Use `--full` only for deliberate local inspection.

## Build A Timeline

```sh
aisdk-dt timeline <runId> --file <path>
```

Use timelines for multi-step runs, nested agent calls, and tool-heavy traces.
