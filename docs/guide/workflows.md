# Workflows

These workflows are intended for coding agents inspecting an AI SDK DevTools `generations.json` file.

## Inspect What Just Happened

The default command inspects the latest root run with tool calls/results, usage,
cache usage, step status, timeline, a narrative summary, final output, and
diagnostics. Add `--messages <number>` when transcript messages are needed.

```sh
aisdk-dt --file <path>
```

Inspect a specific run:

```sh
aisdk-dt inspect <runId> --file <path>
```

## Find Recent Runs

```sh
aisdk-dt runs --limit 10 --file <path>
```

Select the latest ID for subsequent shell commands:

```sh
RUN_ID=$(aisdk-dt runs --limit 1 --json-path 'runs[0].id' --text --file <path>)
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

A failed inspection stays compact and identifies the failure point:

```text
run run_123 status=error started=2026-07-24T08:15:00.000Z
summary=Run error at step 2: provider request failed.
likelyFailurePoint=step 2: provider request failed
```

## Inspect One Run

```sh
aisdk-dt inspect <runId> --file <path>
```

Include nested child runs and trace spans:

```sh
aisdk-dt run <runId> --include-children --timeline --file <path>
```

## Read The Prompt Transcript

```sh
aisdk-dt messages <runId> --limit 12 --max-chars 500 --file <path>
aisdk-dt inspect <runId> --messages 12 --max-chars 500 --file <path>
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

## Inspect Final Output

```sh
aisdk-dt final <runId> --file <path>
aisdk-dt final --latest --max-chars 2000 --file <path>
```

Use this when the default inspection preview identifies the last meaningful
output but exact content matters.

## Inspect Tool Calls And Results

```sh
aisdk-dt tools <runOrStepId> --file <path>
```

Representative text output labels how calls and results relate:

```text
run run_123 calls=1 pairedResults=1 replayedResults=0 available=2
call paired-next-step step=1 getWeather id=call_1 input={"city":"Yerevan"}
result paired-next-step originalCallStep=1 observedStep=2 getWeather id=call_1 output={"temperature":31}
```

Include available tool definitions:

```sh
aisdk-dt tools <runOrStepId> --available --file <path>
aisdk-dt tools <runOrStepId> --available-only --file <path>
```

Filter to one tool call:

```sh
aisdk-dt tools <runOrStepId> --tool-call-id <toolCallId> --file <path>
```

## Check Token Usage

```sh
aisdk-dt usage <runOrStepId> --file <path>
```

```text
input=1240 noCache=800 cacheRead=440 cacheHit=35.5% output=180 text=150 reasoning=30
```

Use this when debugging cost, cache behavior, or unexpectedly large prompts.

## Inspect Stream Events

```sh
aisdk-dt events <stepId> --last 20 --file <path>
aisdk-dt events <stepId> --chunks --type response.created --file <path>
```

Use event summaries for aborted or hung streams before reaching for raw payloads.
The event diagnosis calls out common patterns such as aborted streamed tool
input or missing terminal events.

## Query Raw Payloads

Start with a narrow JSON path:

```sh
aisdk-dt raw <stepId> --request --json-path 'model' --file <path>
aisdk-dt raw <stepId> --response --json-path 'content[0]' --max-chars 800 --file <path>
```

Bounded JSON preserves original size information:

```json
{
  "preview": "{\"type\":\"response.created\"...",
  "truncated": true,
  "chars": 4821
}
```

Use `--full` only for deliberate local inspection.

## Build A Timeline

```sh
aisdk-dt timeline <runId> --file <path>
```

Use timelines for multi-step runs, nested agent calls, and tool-heavy traces.
Content is omitted by default; add `--include-content --max-chars 500` only
when the timing and labels are insufficient.
