# Compatibility

## Runtime

The published CLI targets Node.js 20 or newer. Repository development and docs
use Node.js 22.18 or newer; the example app uses Node.js 22 or newer.

## Tested AI SDK Surface

The repository fixtures and compatibility tests currently run with:

- `ai` 7.0.36
- `@ai-sdk/devtools` 1.0.7 in the example app

Compatible patch/minor releases may work, but these are the exact versions
covered by the release validation for this documentation.

## Database Envelope

`aisdk-dt` expects a top-level JSON object containing `runs` and `steps`
arrays. Run/step identity, timestamps, relationships, model/provider metadata,
and serialized payload fields are validated. Unknown top-level and record
fields are retained where the schema permits them.

The CLI strictly validates the database envelope but tolerates newer message
content. It recognizes text, reasoning, tool calls/results, images, files,
reasoning files, custom parts, sources, and tool-approval parts. An
unrecognized content part is retained as local metadata with
`unsupported: true` instead of making the entire database unreadable.

## Output Stability

Command names, documented option meanings, exit status `0` for success, and
JSON field names are treated as the compatibility surface. New metadata fields
may be added in minor releases. Bounded previews are part of the contract:
large strings and arrays may be replaced or followed by truncation metadata.

Commands that advertise `--full` deliberately opt out of total-output
truncation. Scripts should prefer a semantic command plus `--json-path` and
should tolerate additional object properties.
