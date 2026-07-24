# Troubleshooting

## Database File Not Found

Run the command from the app that produced the DevTools file, or pass its
absolute path:

```sh
aisdk-dt runs --file /absolute/path/to/.devtools/generations.json
```

Confirm AI SDK DevTools is enabled and that the app has completed at least one
generation.

## No Runs Found

The file can be valid but empty. Trigger one request in the app, then rerun
`aisdk-dt runs`. Add `--all` if you specifically need child runs.

## Partial or Corrupt JSON

The CLI retries a likely active-write race for a short bounded window when the
file changes. If invalid JSON remains unchanged, it reports the final parse
error. Wait for the app write to finish and retry. If it still fails, preserve
the file and validate it with a local JSON tool before replacing anything.

## File Exceeds the Safety Limit

The default database limit is 100 MiB. Inspect the file size first. If the size
is expected and local disk/memory capacity is adequate, raise the limit
deliberately:

```sh
aisdk-dt runs --max-file-bytes 209715200 --file <path>
```

## Unknown Content

New AI SDK content parts do not invalidate the whole database. Semantic message
output reports them with `unsupported: true`. Update `aisdk-dt` first; use a
narrow local `step --field` or `raw --json-path` query only if the metadata is
insufficient.

## Invalid Run or Step ID

Refresh IDs from the same database:

```sh
aisdk-dt runs --limit 10 --file <path>
aisdk-dt steps <runId> --file <path>
```

Do not reuse IDs copied from a different checkout or regenerated file.

## Local Package Is Not Resolved

If `aisdk-dt` is a project dependency, use the project package manager:

```sh
pnpm exec aisdk-dt --version
```

From this repository, build the workspace binary before using it from the
example:

```sh
pnpm --filter aisdk-dt run build
```

## Node.js Version Mismatch

The CLI requires Node.js 20+. The repository example requires Node.js 22+.
Check `node --version` and switch runtimes before reinstalling dependencies.
