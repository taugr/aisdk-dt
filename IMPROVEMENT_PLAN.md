# aisdk-dt Improvement Plan

Status: proposed  
Scope: CLI safety, compatibility, correctness, performance, tests, CI, and documentation  
Implementation state: not started

## Objective

Strengthen `aisdk-dt` around its central promise:

> Let people and coding agents inspect AI SDK DevTools
> `generations.json` files through small, deliberate, bounded outputs.

The project already has a useful command model, a bundled inspection skill, a
working example, and substantial documentation. The next work should make the
runtime enforce the safety and compatibility guarantees that those surfaces
describe.

This plan intentionally separates implementation, local validation, commit,
push, deployment, and release. Completing one gate does not imply approval for
the next.

## Current Baseline

As of 2026-07-24:

- The core tests, lint, formatting, build, documentation build, example build,
  and package dry-run pass locally.
- The test suite contains 18 tests across generation queries, AI SDK type
  compatibility, and the bundled skill.
- `src/cli.ts` contains command wiring and text rendering in approximately 900
  lines.
- `src/generations.ts` contains loading, parsing, indexing-like queries,
  summaries, output shaping, event diagnosis, and timeline construction in
  approximately 1,500 lines.
- The checkout is one lockfile-only dependency commit behind `origin/main`.
- Existing untracked `.DS_Store` files are unrelated and must remain untouched.

Before implementation begins, refresh `main` safely and confirm that the
lockfile-only remote change does not affect the assumptions in this plan.

## Guiding Principles

1. **Bounded means bounded end to end.** A semantic command must have a
   documented maximum output size or item count unless the user explicitly asks
   for full content.
2. **Semantic inspection comes before raw inspection.** Summary commands expose
   metadata and bounded content; raw payload access remains deliberate.
3. **Strict envelope, tolerant contents.** Validate the database structure and
   identifiers, but preserve unknown future content parts without discarding an
   entire input or output.
4. **Machine-readable output is a product contract.** JSON shapes, exit codes,
   projection behavior, and truncation metadata should be testable and
   documented.
5. **Real fixtures carry more weight than type-only compatibility.** Tests
   should exercise sanitized databases representing actual AI SDK DevTools
   behavior.
6. **Optimize measured bottlenecks.** Add indexes and parse caches first; adopt
   streaming only if representative benchmarks justify the added complexity.
7. **Refactor along delivery boundaries.** Extract modules while implementing
   behavior, rather than performing a standalone large-file rewrite.
8. **Keep the CLI, README, docs, example, and bundled skill aligned.**

## Scope

### Included

- Bounded output policy for every semantic command
- Removal of accidental raw-content previews
- Tolerant support for current and future AI SDK content parts
- Correct transcript reconstruction for multi-step runs
- CLI subprocess and packed-package contract tests
- Node.js 20 and Node.js 22 CI coverage
- Stable reads of actively written DevTools files
- Database indexes, parse caching, and representative benchmarks
- Fixes to command examples, documentation metadata, privacy guidance, and
  compatibility documentation
- Focused extraction of command wiring, database access, output shaping, and
  rendering from the current large modules

### Not Included

- A replacement for the official AI SDK DevTools viewer
- A TUI or browser UI
- Remote or hosted ingestion of generation logs
- Uploading, syncing, or sharing sensitive DevTools files
- A long-running background daemon
- Provider-specific analytics unrelated to inspecting the recorded data
- Breaking command renames without a separate compatibility decision
- Automatic npm publication or documentation deployment

## Delivery Overview

| Phase | Outcome                                                        | Depends on                |
| ----- | -------------------------------------------------------------- | ------------------------- |
| 0     | Baseline and fixtures are reproducible                         | Plan approval             |
| 1     | All semantic output obeys a central safety policy              | Phase 0                   |
| 2     | AI SDK content parsing is tolerant and transcripts are correct | Phase 1                   |
| 3     | The real CLI contract is tested and enforced in CI             | Phases 1-2                |
| 4     | Large and actively written databases are handled reliably      | Phase 3                   |
| 5     | Documentation and skill guidance match verified behavior       | Phases 1-4                |
| 6     | Release readiness is assessed explicitly                       | All implementation phases |

Phases should normally land as focused commits or pull requests. Documentation
for changed behavior belongs in the same phase as that behavior; Phase 5 is for
cross-cutting cleanup and consolidation.

## Phase 0: Baseline and Fixture Foundation

### Goals

- Start implementation from the current `origin/main`.
- Preserve unrelated working-tree content.
- Establish sanitized fixtures that later phases can share.
- Record current CLI behavior before changing output contracts.

### Tasks

1. Fast-forward `main` without overwriting local files.
2. Re-run the baseline validation commands listed below.
3. Add `tests/fixtures/` with small, sanitized databases covering:
   - a successful generated-text run;
   - a streamed run;
   - a multi-step tool call and result;
   - a terminal unpaired tool call;
   - a nested child run;
   - an errored run;
   - an in-progress run;
   - object output;
   - multimodal user content;
   - an unknown future content part.
4. Ensure fixtures contain no real prompts, credentials, provider payloads, or
   identifying data.
5. Add fixture helpers so tests do not continue expanding a single large inline
   object in `tests/generations.test.ts`.
6. Capture the current JSON and text output for representative commands as
   review material. Treat those captures as compatibility evidence, not
   automatically as the desired final contract.

### Likely Files

- `tests/fixtures/*.json`
- `tests/helpers/fixtures.ts`
- `tests/generations.test.ts`

### Acceptance Criteria

- Every fixture parses through `readDatabase()`.
- Fixtures represent the intended edge cases without secrets.
- Existing tests still pass.
- No generated `.devtools` directory is committed.

## Phase 1: Enforce Bounded Semantic Output

### Problem

The current `--max-chars` behavior limits selected values, not complete command
output. Some semantic paths can still expose full tool arguments, results,
reasoning, text, or raw-field previews.

Known examples include:

- `inspect` returning unbounded tool call and result objects;
- `steps` and `run` including previews of raw fields;
- `timeline` returning complete `thinkingText` and `textContent`;
- commands returning an unbounded number of individually truncated items.

### Design

Introduce a reusable, data-aware output policy. It must preserve valid JSON and
must not truncate an already serialized JSON string arbitrarily.

The policy should define:

- maximum preview characters per content value;
- maximum items for steps, messages, tool calls, results, events, children, and
  timeline spans;
- a total output budget or an equivalent structural budget that provides a
  reliable upper bound;
- maximum nesting depth for unknown raw objects;
- consistent truncation metadata, including original counts and omitted counts;
- explicit handling for `--full`;
- content categories that semantic commands may expose by default.

Keep `--max-chars` backward compatible as a per-value preview control. If a new
global budget flag is added, give it a distinct name and document its
interaction with command-specific limits.

### Tasks

1. Add a dedicated output-policy module rather than continuing to distribute
   truncation logic across command handlers and query functions.
2. Change raw-field metadata to expose `present` and `chars` by default, without
   including raw content.
3. Bound and sanitize the `tools` section returned by `inspect`.
4. Remove full reasoning and text content from default timeline output.
5. If timeline content remains useful, expose it through an explicit,
   content-revealing option with normal preview limits; reserve complete content
   for `--full`.
6. Add item limits to commands that can return collections without a practical
   bound.
7. Emit clear metadata when content or items were omitted.
8. Keep JSON output syntactically valid under every budget.
9. Make text rendering respect the same content and item policy as JSON.
10. Review every command:
    - default inspection;
    - `inspect`;
    - `final`;
    - `runs`;
    - `run`;
    - `steps`;
    - `step`;
    - `messages`;
    - `output`;
    - `tools`;
    - `usage`;
    - `raw`;
    - `timeline`;
    - `events`.
11. Update README, command reference, safe-inspection guidance, and the bundled
    skill in the same phase.

### Likely Files

- `src/output-policy.ts` or `src/output.ts`
- `src/generations.ts`
- `src/cli.ts`
- `src/types.ts`
- `tests/output-safety.test.ts`
- `tests/generations.test.ts`
- `README.md`
- `docs/guide/commands.md`
- `docs/guide/safe-inspection.md`
- `.agents/skills/aisdk-dt-inspector/SKILL.md`

### Required Tests

- Large string values are previewed.
- Large arrays are limited with omitted counts.
- Deep objects do not bypass the output policy.
- Default inspection cannot emit a full oversized tool argument or result.
- `steps` and `run` do not reveal raw-field content.
- Default timeline output contains labels and timing but not complete reasoning
  or response text.
- `--full` remains explicit and returns the selected complete content.
- Secret canary strings placed beyond the configured bounds never appear.
- JSON and text output remain useful after truncation.

### Acceptance Criteria

- Every semantic command has a documented structural or total output bound.
- No raw request, response, chunk, or provider content is exposed by summary
  commands.
- Full content requires an explicit content selector or `--full`.
- Safety regression tests cover both JSON and text output.

## Phase 2: Tolerant AI SDK Compatibility and Transcript Correctness

### Problem

The current content-part schema recognizes a narrow set of part types. If a
prompt or output contains a valid but unsupported AI SDK part, parsing can
discard the whole input or output from semantic inspection.

Multi-step prompt inputs are also cumulative. Concatenating every step's prompt
can repeat the same user, assistant, and tool messages and make `--limit`
describe duplicated history rather than the actual recent transcript.

### Design

Separate three concerns:

1. database-envelope validation;
2. tolerant decoding of recorded JSON strings;
3. semantic interpretation of known content parts.

Unknown content should remain visible as bounded metadata. It should not make
known neighboring text, tool, usage, or configuration data disappear.

### Tasks

1. Add explicit support for relevant current AI SDK parts, including:
   - text;
   - image;
   - file;
   - reasoning;
   - reasoning-file;
   - custom parts;
   - tool calls;
   - tool results;
   - tool approval requests and responses;
   - source/file output parts where present in recorded output.
2. Preserve unknown parts with:
   - their `type` when available;
   - a bounded metadata representation;
   - an `unsupported` or `unknown` marker.
3. Avoid failing an entire message because one part is unfamiliar.
4. Avoid failing an entire parsed output because one content item is
   unfamiliar.
5. Add a compatibility test against the installed `ai` types without treating
   type compatibility as a substitute for runtime fixtures.
6. Reconstruct a run transcript without repeated cumulative prompt history.
7. Preserve useful provenance, such as first-seen step and observed step
   numbers, when deduplicating messages.
8. Define how messages without stable IDs are compared. Prefer stable tool call
   IDs and structural content keys over display-text-only comparison.
9. Confirm that system-message omission and role/part filters operate after
   reconstruction.
10. Improve schema errors to include the failing path and a concise remediation
    hint.
11. Document the tested AI SDK and DevTools versions and the unknown-part
    fallback behavior.

### Likely Files

- `src/schema.ts`
- `src/types.ts`
- `src/parsing.ts`
- `src/generations.ts`
- `tests/ai-sdk-compat.test.ts`
- `tests/generations.test.ts`
- `tests/fixtures/*.json`
- `docs/guide/compatibility.md`
- `docs/guide/commands.md`

### Required Tests

- A user message containing text plus an image retains its text and image
  metadata.
- A file or custom part does not null the full input.
- An unknown part does not remove known neighboring parts.
- An unsupported output part does not hide text, finish reason, usage, or tool
  calls.
- Cumulative multi-step prompts produce one coherent transcript.
- `--limit`, `--role`, `--parts`, and system-message behavior remain correct
  after reconstruction.

### Acceptance Criteria

- Unsupported nested content degrades visibly and locally.
- Known content continues to be queryable when unknown parts are present.
- Recent messages are not dominated by cumulative duplicates.
- Compatibility claims are backed by checked-in runtime fixtures.

## Phase 3: CLI Contract Tests and CI

### Problem

The library helpers are tested, but the published CLI surface is not exercised
end to end. Documentation can therefore reference nonexistent options or
different output keys without failing CI.

Known contract gaps include:

- the example uses `runs --json-path`, which is not currently supported;
- the example path uses `items[0].id`, while the command returns `runs`;
- `--version` is not supported;
- command descriptions and skill guidance disagree about whether default
  inspection includes recent messages;
- invalid target IDs and invalid option ranges do not have a fully tested error
  contract.

### Design

Make command construction testable while retaining subprocess tests against the
actual built binary.

Prefer a small entrypoint that creates the Commander program from injectable
dependencies. Keep text renderers and output policy outside the entrypoint.

### Tasks

1. Extract program construction from `src/cli.ts`.
2. Keep `src/cli.ts` as the executable entrypoint and move command definitions
   to a testable module.
3. Move text rendering into its own module with focused tests.
4. Add `--version` using the package version or a build-time constant.
5. Keep recent messages opt-in so default inspection does not reveal prompt
   content unexpectedly. Correct every command description and skill statement,
   and keep `--messages <number>` as the explicit bounded opt-in.
6. Add a machine-friendly way to select the latest run ID. The smallest
   backward-compatible option is to support `--json-path` on `runs` using the
   existing path evaluator and document the correct path as `runs[0].id`.
7. Define exit codes and stderr behavior for:
   - file not found;
   - invalid JSON;
   - schema mismatch;
   - no runs;
   - unknown run or step;
   - invalid numeric range;
   - invalid date;
   - missing JSON path.
8. Validate numeric options as positive or non-negative according to their
   meaning.
9. Validate role, part, section, and date options before loading or querying the
   database.
10. Add subprocess tests that run `node dist/cli.js` against fixtures.
11. Add a packed-package smoke test that installs the dry-run tarball in a
    temporary project and invokes the binary.
12. Update CI:
    - test the CLI baseline on Node.js 20 and Node.js 22;
    - run test, lint, format, build, and type-check;
    - build docs;
    - build the example on Node.js 22;
    - run CLI and package smoke tests;
    - run `git diff --check`.
13. Run documentation examples in tests or represent each important example in
    a named CLI contract test.

### Likely Files

- `src/cli.ts`
- `src/program.ts`
- `src/render-text.ts`
- `src/output-policy.ts`
- `tests/cli.test.ts`
- `tests/render-text.test.ts`
- `scripts/smoke-package.mjs`
- `.github/workflows/unit-test.yml`
- `package.json`
- `README.md`
- `docs/guide/commands.md`
- `examples/simple-chatbot/README.md`
- `.agents/skills/aisdk-dt-inspector/SKILL.md`

### Acceptance Criteria

- Every public command has at least one subprocess-level success test.
- Important failure paths assert exit code and stderr.
- `aisdk-dt --version` reports the package version.
- The documented latest-run-ID workflow runs successfully.
- CI exercises the supported Node.js 20 baseline and the Node.js 22 workspace
  baseline.
- A packed copy of the package can execute outside the monorepo.

## Phase 4: Database Read Resilience and Performance

### Problem

Each invocation synchronously reads and parses the complete database. Query
helpers repeatedly filter and sort the same arrays and repeatedly parse the
same serialized input, output, usage, and raw fields.

AI SDK DevTools rewrites the database file directly. A CLI read during a write
can observe partial JSON and fail even though the file becomes valid moments
later.

### Design

Add a loaded-database abstraction with indexes and per-step parse caches. Make
file reads stable and bounded before considering a streaming parser.

### Tasks

1. Introduce a `LoadedDatabase` or `DatabaseIndex` abstraction containing:
   - run by ID;
   - step by ID;
   - steps by run ID;
   - child runs by parent run ID;
   - optional precomputed run aggregates.
2. Replace repeated whole-array scans in run listing, child traversal, tool
   pairing, usage totals, and timeline construction.
3. Cache parsed input, output, usage, provider options, and raw event arrays for
   the lifetime of one invocation.
4. Apply filters and pagination before expensive presentation work whenever
   their required metadata is available.
5. Add a configurable file-size guard with a clear error and explicit override.
6. Implement bounded retry behavior for likely partial-write JSON failures:
   - retry only a small documented number of times;
   - confirm file size or modification time changed;
   - do not hide a persistently corrupted file;
   - report the final parse error clearly.
7. Avoid blocking sleeps longer than necessary.
8. Add representative synthetic benchmarks for:
   - recent run listing;
   - one-run inspection;
   - messages;
   - tools;
   - usage;
   - timeline.
9. Include high step counts, child runs, and large raw payload strings in the
   benchmark data.
10. Record baseline and indexed results in a short development document.
11. Consider streaming or partial JSON parsing only if indexed full-file loading
    remains inadequate at realistic database sizes.

### Likely Files

- `src/database.ts`
- `src/database-index.ts`
- `src/parsing.ts`
- `src/generations.ts`
- `tests/database.test.ts`
- `tests/performance.test.ts` or `scripts/benchmark.mjs`
- `docs/guide/development.md`
- `docs/guide/troubleshooting.md`

### Required Tests

- Indexed queries return the same semantic results as fixture-based baseline
  queries.
- A transient partial write succeeds after a stable retry.
- Persistently invalid JSON fails with a concise error.
- An oversized file fails before an unbounded read unless explicitly allowed.
- Child-run traversal and tool pairing remain correct.
- Parse caches do not leak between separate database loads.

### Acceptance Criteria

- Run and step lookups no longer scan the complete arrays repeatedly.
- `runs --limit 10` does not fully present every run before slicing.
- One invocation parses each serialized step field no more than necessary.
- Active-write races have a tested recovery path.
- Benchmark evidence determines whether streaming work is needed.

## Phase 5: Documentation, Skill, and Site Alignment

### Goals

- Make the existing documentation accurate, executable, and easier to trust.
- Explain compatibility and privacy boundaries clearly.
- Reduce drift between the CLI, README, docs site, example, and bundled skill.

### Tasks

1. Correct the documentation site URL and canonical/social metadata to the
   deployed `https://taugr.github.io/aisdk-dt/` location.
2. Normalize repository links to the canonical `taugr/aisdk-dt` repository.
3. Fix the example's latest-run-ID command and test it.
4. Add representative command output, including truncation metadata, to:
   - getting started;
   - inspect a failed run;
   - inspect tool calls and results;
   - inspect token usage;
   - inspect raw data deliberately.
5. Add a troubleshooting guide for:
   - missing `.devtools/generations.json`;
   - no runs;
   - partial or corrupt writes;
   - unsupported or unknown content;
   - oversized files;
   - invalid run and step IDs;
   - local package resolution;
   - Node.js version mismatches.
6. Add a compatibility page that states:
   - tested AI SDK versions;
   - tested `@ai-sdk/devtools` versions;
   - supported database envelope;
   - unknown-content fallback behavior.
7. Expand privacy guidance with a command-by-command explanation of when prompt,
   reasoning, tool, raw, or provider content can appear.
8. Document the JSON output contract, truncation metadata, and stability policy.
9. Align the bundled skill with the tested default workflow.
10. Strengthen `tests/skill.test.ts` so it validates important commands and
    safety statements instead of checking only a few static substrings.
11. Add a lightweight documentation-command check. Prefer using existing CLI
    metadata and tests before introducing a documentation generator dependency.
12. Review README duplication and keep it as the concise package landing page;
    move extended explanation to the docs site.

### Likely Files

- `README.md`
- `docs/.vitepress/config.ts`
- `docs/guide/getting-started.md`
- `docs/guide/commands.md`
- `docs/guide/safe-inspection.md`
- `docs/guide/workflows.md`
- `docs/guide/compatibility.md`
- `docs/guide/troubleshooting.md`
- `docs/guide/development.md`
- `.agents/skills/aisdk-dt-inspector/SKILL.md`
- `examples/simple-chatbot/README.md`
- `tests/skill.test.ts`
- `tests/docs-commands.test.ts`

### Acceptance Criteria

- The canonical site URL resolves successfully.
- Every copied command used in onboarding has a corresponding passing contract
  test.
- Default-message behavior is described consistently everywhere.
- Compatibility, truncation, and privacy behavior are documented.
- README, docs, example, and skill use the same command forms.

## Architecture Direction

Avoid a large preparatory rewrite. Extract responsibilities as their related
phases are implemented.

A likely end state is:

```text
src/
  cli.ts                 executable entrypoint
  program.ts             Commander program and command wiring
  database.ts            stable file loading
  database-index.ts      run/step/child indexes
  parsing.ts             tolerant recorded-value parsing and caches
  schema.ts              database envelope and known part schemas
  output-policy.ts       bounded output rules and truncation metadata
  render-text.ts         compact text rendering
  generations.ts         public semantic query facade
  types.ts               shared public/internal types
```

Further query-specific modules should be introduced only when they make a
phase easier to reason about or test.

## Validation Matrix

### Focused Validation

Each phase starts with its affected tests, for example:

```bash
pnpm exec vitest --run tests/output-safety.test.ts
pnpm exec vitest --run tests/ai-sdk-compat.test.ts
pnpm exec vitest --run tests/cli.test.ts
pnpm exec vitest --run tests/database.test.ts
```

### Required Local Validation

Run sequentially where build or generated documentation artifacts could
interfere:

```bash
pnpm run test
pnpm run format
pnpm run build
pnpm run docs:build
pnpm run lint
pnpm --filter aisdk-dt-example-chatbot run build
pnpm peers check
pnpm pack --dry-run
node dist/cli.js --help
node dist/cli.js --version
git diff --check
```

Also run the packed-package smoke test once it exists.

### Manual Review

- Inspect compact JSON and text output from every command.
- Confirm truncation metadata is understandable.
- Confirm default semantic commands do not reveal raw content.
- Confirm `--full` behavior is deliberate and clearly signposted.
- Inspect the generated docs site navigation and canonical metadata.
- Verify the example's documented CLI workflow against a sanitized fixture or a
  disposable live run.

### Validation Reporting

For every phase, report:

- commands run;
- pass/fail result;
- relevant warnings;
- checks not run;
- whether validation used fixtures, a packed package, or a live service;
- working-tree, commit, push, deployment, and release state separately.

## Compatibility and Release Considerations

Some fixes can change output shapes or remove content that was previously
exposed accidentally. Treat these changes as user-visible even when they improve
safety.

Before release:

1. Compare the final CLI output against the current `0.1.3` package.
2. Document removed accidental fields and their explicit replacement options.
3. Decide whether JSON output needs a format-version field.
4. Confirm that scripts can still obtain run and step IDs reliably.
5. Review whether the release should be a `0.2.0` feature release rather than a
   patch, based on the final output-contract changes.
6. Run the packed-package smoke test on Node.js 20 and Node.js 22.
7. Confirm the npm tarball contains only intended package files.
8. Prepare release notes, but do not tag, publish, push, or deploy without
   explicit approval.

## Suggested Commit Boundaries

Commit boundaries may change with implementation, but the intended logical
sequence is:

1. `docs: add aisdk-dt improvement plan`
2. `test: add sanitized devtools fixtures`
3. `fix: enforce bounded semantic output`
4. `fix: tolerate evolving ai sdk content`
5. `fix: reconstruct multi-step transcripts`
6. `test: add cli contract and package smoke coverage`
7. `ci: validate supported package surfaces`
8. `perf: index generations database queries`
9. `fix: make devtools database reads resilient`
10. `docs: align cli workflows and site metadata`

Do not create commits merely to match this list. Keep each commit independently
reviewable and validated.

## Approval Gates

### Gate A: Plan Approval

- Review and adjust this document.
- No runtime implementation is implied.

### Gate B: Implementation Approval

- Implement the approved phases locally.
- Preserve unrelated files.
- Do not commit, push, deploy, tag, or publish unless separately requested.

### Gate C: Local Validation Approval

- Run the focused and full local validation matrix.
- Live provider/API verification requires separate credentials and should be
  identified explicitly as live testing.

### Gate D: Commit Approval

- Stage only intended files.
- Review the staged diff.
- Create conventional commits after explicit approval.

### Gate E: Push or Pull Request Approval

- Push only the approved branch and commits.
- A pull-request branch push does not imply merging.
- A direct push to `main` can trigger the documentation deployment workflow and
  therefore requires explicit approval with that effect understood.

### Gate F: Release and Deployment Approval

- Tagging, GitHub release creation, npm publication, merging to a
  deployment-triggering branch, and documentation deployment remain separate
  external actions.
- Verify the exact published package, tag, commit, CI result, and deployed site
  after any approved release.

## Definition of Done

The improvement program is complete when:

- semantic commands obey documented output and item bounds;
- raw payload content appears only through explicit inspection paths;
- current multimodal and tool content is handled without all-or-nothing parse
  loss;
- unknown future parts degrade locally and visibly;
- multi-step transcripts are coherent and non-duplicative;
- every public command has CLI-level contract coverage;
- Node.js 20 and Node.js 22 package surfaces are exercised in CI;
- actively written and large database files have tested behavior;
- representative performance is measured and acceptable;
- README, docs, example, and bundled skill agree with the CLI;
- canonical site and repository metadata are correct;
- package, commit, push, deployment, and release state have each been verified
  independently.
