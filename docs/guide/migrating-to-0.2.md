# Migrating from 0.1 to 0.2

Version 0.2 makes the default inspection surface safer and gives scripts a
tested CLI contract. The command names remain compatible, but some JSON content
is now deliberately bounded or omitted.

## Output Changes

| 0.1 behavior                                                   | 0.2 behavior                                                            | Explicit replacement                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Step summaries could include a short raw-field preview         | Raw fields report only `present` and `chars`                            | `raw <stepId> --json-path <path> --max-chars <n>`                   |
| Timelines included complete reasoning and response text        | Timelines contain timing and labels only                                | `timeline --include-content --max-chars <n>` or deliberate `--full` |
| `inspect` could return every complete tool argument/result     | Tool data is previewed and limited with omitted counts                  | `tools <targetId> --max-chars <n>` or deliberate `--full`           |
| There was no reliable total-output ceiling                     | Output defaults to a 32,000-character structural budget                 | Raise `--max-output-chars` deliberately                             |
| Cumulative prompts could duplicate earlier transcript messages | Messages are reconstructed with first-seen and observed-step provenance | No action required                                                  |

Long strings now use self-describing metadata:

```json
{
  "preview": "bounded value",
  "truncated": true,
  "chars": 18000
}
```

Long arrays add an item containing `totalItems` and `omittedItems`. Deep unknown
objects stop with `{"truncated":true,"reason":"max-depth"}`.

## Scripted Run Selection

Use the tested result path:

```sh
RUN_ID=$(aisdk-dt runs --limit 1 --json-path 'runs[0].id' --text)
```

The older item-wrapper path was incorrect; `runs[0].id` is the supported
result path.

## Messages and New Content Parts

Prompt messages remain opt-in on `inspect` through `--messages <number>`.
Version 0.2 recognizes images, files, reasoning files, sources, custom content,
and tool-approval parts. Unknown future parts are retained as bounded metadata
with `unsupported: true` instead of invalidating neighboring known content.

## Format Version Decision

Version 0.2 does not add a top-level JSON format-version field. The package
version is the compatibility marker, commands return independently useful
objects, and truncation objects identify themselves. Scripts should select the
smallest semantic result or JSON path and tolerate additional object fields.
A dedicated format version remains appropriate if a future stable major release
needs multiple concurrently supported output schemas.
