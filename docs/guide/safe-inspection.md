# Safe Inspection

`generations.json` can contain sensitive prompts, raw provider payloads, tool arguments, tool results, response chunks, and reasoning-like content. `aisdk-dt` is designed to help agents inspect that data deliberately.

## Start Semantic

Prefer semantic commands first:

```sh
aisdk-dt runs --limit 10 --file <path>
aisdk-dt messages <runId> --limit 6 --max-chars 500 --file <path>
aisdk-dt steps <runId> --file <path>
aisdk-dt output <stepId> --max-chars 800 --file <path>
aisdk-dt tools <runOrStepId> --file <path>
aisdk-dt usage <runOrStepId> --file <path>
```

These commands summarize the data without dumping every raw field.

## Bound Large Content

Use `--max-chars` whenever output may include:

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

## Pass Absolute Paths Across Repos

When the agent is not running from the app that produced the DevTools file, pass an absolute path:

```sh
aisdk-dt runs --file /absolute/path/to/.devtools/generations.json
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
