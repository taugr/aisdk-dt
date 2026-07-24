import { Command } from 'commander';
import { createRequire } from 'node:module';
import {
  findStep,
  findLatestRun,
  finalOutputForRun,
  getMessagesForRun,
  getRunDetail,
  inspectRun,
  eventsForStep,
  outputForStep,
  rawForStep,
  readDatabase,
  runsNewestFirst,
  runDetailSummary,
  resolveDbPath,
  stepSummary,
  stepsForRun,
  summarizeRun,
  toolsForTarget,
  traceSpanSummaries,
  usageForTarget,
  buildTraceSpans,
  getByPath,
  parseJson,
  preview,
  DEFAULT_MAX_DATABASE_BYTES,
} from './generations.js';
import {
  boundOutputValue,
  boundRenderedText,
  DEFAULT_MAX_OUTPUT_CHARS,
  stringifyBoundedOutput,
} from './output-policy.js';
import { renderText } from './render-text.js';

interface GlobalOptions {
  file?: string;
  maxFileBytes?: number;
  maxOutputChars?: number;
  pretty?: boolean;
  text?: boolean;
}

const packageVersion = (
  createRequire(import.meta.url)('../package.json') as { version: string }
).version;

export const program = new Command();

program
  .name('aisdk-dt')
  .version(packageVersion)
  .description(
    'Inspect AI SDK DevTools generations.json files for LLM-friendly debugging.',
  )
  .option(
    '--file <path>',
    'Path to generations.json. Defaults to .devtools/generations.json.',
  )
  .option('--pretty', 'Pretty-print JSON output.')
  .option('--text', 'Render a compact human-readable output.')
  .option(
    '--max-output-chars <number>',
    'Maximum total output characters (at least 256) unless --full is used.',
    parseOutputLimitOption,
    DEFAULT_MAX_OUTPUT_CHARS,
  )
  .option(
    '--max-file-bytes <number>',
    'Maximum generations.json size to read.',
    parsePositiveIntOption,
    DEFAULT_MAX_DATABASE_BYTES,
  )
  .action(() => {
    const db = loadDb();
    const run = findLatestRun(db);
    if (!run) fail('No root runs found.');
    writeOutput(
      inspectRun(db, run.id, {
        maxChars: 500,
        includeEvents: true,
      }),
    );
  });

program
  .command('inspect [runId]')
  .alias('recent')
  .description('Inspect a run with tools, usage, diagnostics, and timeline.')
  .option('--latest', 'Inspect the latest root run.')
  .option('--all', 'Allow --latest to select child runs.')
  .option(
    '--messages <number>',
    'Number of recent messages to include.',
    parsePositiveIntOption,
  )
  .option('--include-system', 'Include system messages in message output.')
  .option('--usage-per-message', 'Include usage on every rendered message.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parsePositiveIntOption,
    500,
  )
  .option('--events', 'Include recent raw stream events for errored runs.')
  .action((runId, options) => {
    const db = loadDb();
    const resolvedRunId = resolveRunId(db, runId, {
      latest: Boolean(options.latest) || !runId,
      includeChildren: Boolean(options.all),
    });
    writeOutput(
      inspectRun(db, resolvedRunId, {
        recentMessages: options.messages,
        includeMessages: typeof options.messages === 'number',
        includeSystemMessages: Boolean(options.includeSystem),
        usagePerMessage: Boolean(options.usagePerMessage),
        maxChars: options.maxChars,
        includeEvents: Boolean(options.events),
      }),
    );
  });

program
  .command('final [runId]')
  .description('Show the final meaningful output for a run.')
  .option('--latest', 'Show the final output for the latest root run.')
  .option('--all', 'Allow --latest to select child runs.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parsePositiveIntOption,
    2000,
  )
  .option('--full', 'Emit complete final output payload.')
  .action((runId, options) => {
    const db = loadDb();
    const resolvedRunId = resolveRunId(db, runId, {
      latest: Boolean(options.latest) || !runId,
      includeChildren: Boolean(options.all),
    });
    writeOutput(
      {
        runId: resolvedRunId,
        finalOutput: finalOutputForRun(db, resolvedRunId, {
          maxChars: options.maxChars,
          full: Boolean(options.full),
        }),
      },
      { forceJson: Boolean(options.full), full: Boolean(options.full) },
    );
  });

program
  .command('runs')
  .description('List recent runs.')
  .option(
    '--limit <number>',
    'Number of runs to return.',
    parsePositiveIntOption,
    20,
  )
  .option(
    '--offset <number>',
    'Number of runs to skip.',
    parseNonNegativeIntOption,
    0,
  )
  .option('--all', 'Include child runs as well as root runs.')
  .option('--children', 'Include child run IDs.')
  .option('--errors', 'Only include runs with errors.')
  .option('--in-progress', 'Only include in-progress runs.')
  .option('--model <model>', 'Filter runs containing a model id substring.')
  .option(
    '--provider <provider>',
    'Filter runs containing a provider substring.',
  )
  .option('--function <functionId>', 'Filter runs by function id substring.')
  .option(
    '--since <iso>',
    'Only include runs started at or after this time.',
    parseIsoDateOption,
  )
  .option(
    '--until <iso>',
    'Only include runs started at or before this time.',
    parseIsoDateOption,
  )
  .option('--json-path <path>', 'Select a path from the runs result.')
  .action((options) => {
    const db = loadDb();
    const candidates = runsNewestFirst(db)
      .filter((run) => options.all || !run.parent_run_id)
      .filter((run) => filterRunMetadata(run, options));
    const needsSummaryFilter =
      options.errors ||
      options.inProgress ||
      typeof options.model === 'string' ||
      typeof options.provider === 'string';
    const rows = needsSummaryFilter
      ? candidates
          .map((run) => summarizeRun(db, run, Boolean(options.children)))
          .filter((run) => filterRunSummary(run, options))
          .slice(options.offset, options.offset + options.limit)
      : candidates
          .slice(options.offset, options.offset + options.limit)
          .map((run) => summarizeRun(db, run, Boolean(options.children)));
    const result = {
      dbPath: resolveDbPath(getGlobals().file),
      runs: rows,
    };
    const selected = options.jsonPath
      ? getByPath(result, options.jsonPath)
      : result;
    if (options.jsonPath && selected === undefined) {
      fail(`JSON path not found: ${options.jsonPath}`);
    }
    writeOutput(selected);
  });

program
  .command('run [runId]')
  .description('Show compact run detail.')
  .option('--latest', 'Show the latest root run.')
  .option('--all', 'Allow --latest to select child runs.')
  .option('--include-children', 'Include nested child runs.')
  .option('--timeline', 'Include timeline spans.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parsePositiveIntOption,
    500,
  )
  .action((runId, options) => {
    const db = loadDb();
    const resolvedRunId = resolveRunId(db, runId, {
      latest: Boolean(options.latest),
      includeChildren: Boolean(options.all),
    });
    const result = limitStrings(
      runDetailSummary(db, resolvedRunId, {
        includeChildren: Boolean(options.includeChildren),
        timeline: Boolean(options.timeline),
      }),
      options.maxChars,
    );
    writeOutput(result);
  });

program
  .command('steps [runId]')
  .description('List collapsed step-card summaries for a run.')
  .option('--latest', 'Show steps for the latest root run.')
  .option('--all', 'Allow --latest to select child runs.')
  .action((runId, options) => {
    const db = loadDb();
    const resolvedRunId = resolveRunId(db, runId, {
      latest: Boolean(options.latest),
      includeChildren: Boolean(options.all),
    });
    const steps = stepsForRun(db, resolvedRunId);
    writeOutput({
      runId: resolvedRunId,
      steps: steps.map((step) => stepSummary(step, steps)),
    });
  });

program
  .command('step <stepId>')
  .description('Inspect one step safely.')
  .option(
    '--section <section>',
    'input, output, config, usage, raw, or all.',
    parseStepSection,
    'all',
  )
  .option('--field <field>', 'A raw step field to inspect.')
  .option('--json-path <path>', 'Dot/bracket path inside the selected data.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parsePositiveIntOption,
    500,
  )
  .option('--full', 'Emit complete selected data.')
  .action((stepId, options) => {
    const db = loadDb();
    const step = findStep(db, stepId);
    if (!step) fail(`Step not found: ${stepId}`);
    if (options.field) {
      const rawValue = (
        step as unknown as Record<string, string | null | number>
      )[options.field];
      const parsed =
        typeof rawValue === 'string' ? parseJson(rawValue) : rawValue;
      const selected = options.jsonPath
        ? getByPath(parsed, options.jsonPath)
        : parsed;
      writeOutput(
        {
          stepId,
          field: options.field,
          value: options.full ? selected : preview(selected, options.maxChars),
        },
        { full: Boolean(options.full) },
      );
      return;
    }
    const siblings = stepsForRun(db, step.run_id);
    const summary = stepSummary(step, siblings);
    const input = parseJson(step.input);
    const output = parseJson(step.output);
    const providerOptions = parseJson(step.provider_options);
    const usage = parseJson(step.usage);
    const raw = rawForStep(step, {
      maxChars: options.maxChars,
      full: options.full,
    });
    const sections: Record<string, unknown> = {
      summary,
      input,
      output,
      config: {
        modelId: step.model_id,
        provider: step.provider,
        providerOptions,
      },
      usage,
      raw,
    };
    const selected =
      options.section === 'all'
        ? sections
        : (sections[options.section] ??
          fail(`Unknown section: ${options.section}`));
    writeOutput(limitMaybe(selected, options.maxChars, options.full), {
      full: Boolean(options.full),
    });
  });

program
  .command('messages [runId]')
  .description(
    'Extract recent bounded transcript messages with usage metadata.',
  )
  .option('--latest', 'Show messages for the latest root run.')
  .option('--all', 'Allow --latest to select child runs.')
  .option(
    '--limit <number>',
    'Number of latest messages.',
    parsePositiveIntOption,
    12,
  )
  .option(
    '--role <role>',
    'Filter by role: user, assistant, system, or tool.',
    parseMessageRole,
  )
  .option(
    '--parts <parts>',
    'Comma-separated parts: text,reasoning,tool-calls,tool-results,attachments,unknown.',
    parseMessageParts,
  )
  .option('--include-system', 'Include system messages.')
  .option('--usage-per-message', 'Include usage on every rendered message.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parsePositiveIntOption,
    500,
  )
  .action((runId, options) => {
    const db = loadDb();
    const resolvedRunId = resolveRunId(db, runId, {
      latest: Boolean(options.latest) || !runId,
      includeChildren: Boolean(options.all),
    });
    writeOutput({
      runId: resolvedRunId,
      messages: getMessagesForRun(db, resolvedRunId, {
        limit: options.limit,
        role: options.role,
        parts: options.parts,
        maxChars: options.maxChars,
        withUsage: Boolean(options.usagePerMessage),
        includeSystem: Boolean(options.includeSystem),
      }),
    });
  });

program
  .command('output <stepId>')
  .description('Extract rendered output content for a step.')
  .option('--text', 'Include text output.')
  .option('--reasoning', 'Include reasoning output.')
  .option('--tools', 'Include tool calls and paired results.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parsePositiveIntOption,
    500,
  )
  .option('--full', 'Emit complete selected data.')
  .action((stepId, options) => {
    const db = loadDb();
    const step = findStep(db, stepId);
    if (!step) fail(`Step not found: ${stepId}`);
    const textOnly =
      Boolean(options.text) || hasSubcommandFlag('output', '--text');
    writeOutput(
      outputForStep(step, stepsForRun(db, step.run_id), {
        text: textOnly,
        reasoning: Boolean(options.reasoning),
        tools: Boolean(options.tools),
        maxChars: options.maxChars,
        full: Boolean(options.full),
      }),
      { forceJson: textOnly, full: Boolean(options.full) },
    );
  });

program
  .command('tools [targetId]')
  .description(
    'Query available tools, tool calls, and tool results for a run or step.',
  )
  .option('--latest', 'Show tools for the latest root run.')
  .option('--all', 'Allow --latest to select child runs.')
  .option('--tool-call-id <id>', 'Filter by toolCallId.')
  .option('--available', 'Include available tool definitions.')
  .option('--available-only', 'Show only available tool definitions.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parsePositiveIntOption,
    500,
  )
  .option('--full', 'Emit complete selected data.')
  .action((targetId, options) => {
    const db = loadDb();
    const resolvedTargetId =
      Boolean(options.latest) || !targetId
        ? resolveRunId(db, targetId, {
            latest: true,
            includeChildren: Boolean(options.all),
          })
        : targetId;
    writeOutput(
      limitMaybe(
        queryOrFail(() =>
          toolsForTarget(db, resolvedTargetId, {
            toolCallId: options.toolCallId,
            includeAvailable: Boolean(options.available),
            availableOnly: Boolean(options.availableOnly),
          }),
        ),
        options.maxChars,
        Boolean(options.full),
      ),
      { full: Boolean(options.full) },
    );
  });

program
  .command('usage [targetId]')
  .description('Show token usage for a run or step.')
  .option('--latest', 'Show usage for the latest root run.')
  .option('--all', 'Allow --latest to select child runs.')
  .action((targetId, options) => {
    const db = loadDb();
    const resolvedTargetId =
      Boolean(options.latest) || !targetId
        ? resolveRunId(db, targetId, {
            latest: true,
            includeChildren: Boolean(options.all),
          })
        : targetId;
    writeOutput(queryOrFail(() => usageForTarget(db, resolvedTargetId)));
  });

program
  .command('raw <stepId>')
  .description('Safely query raw request/response/chunk fields.')
  .option('--request', 'Select raw request.')
  .option('--response', 'Select raw response.')
  .option('--chunks', 'Select raw chunks.')
  .option('--provider', 'Select provider raw chunks.')
  .option('--ai-sdk', 'Select AI SDK raw response.')
  .option('--json-path <path>', 'Dot/bracket path inside selected raw data.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parsePositiveIntOption,
    500,
  )
  .option('--full', 'Emit complete selected data.')
  .action((stepId, options) => {
    const db = loadDb();
    const step = findStep(db, stepId);
    if (!step) fail(`Step not found: ${stepId}`);
    writeOutput(
      rawForStep(step, {
        request: Boolean(options.request),
        response: Boolean(options.response),
        chunks: Boolean(options.chunks),
        provider: Boolean(options.provider),
        aiSdk: Boolean(options.aiSdk),
        jsonPath: options.jsonPath,
        maxChars: options.maxChars,
        full: Boolean(options.full),
      }),
      { full: Boolean(options.full) },
    );
  });

program
  .command('timeline [runId]')
  .description('Emit trace timeline spans for a run.')
  .option('--latest', 'Show timeline for the latest root run.')
  .option('--all', 'Allow --latest to select child runs.')
  .option('--include-content', 'Include bounded reasoning and text content.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters for included content.',
    parsePositiveIntOption,
    500,
  )
  .option('--full', 'Emit complete timeline content.')
  .action((runId, options) => {
    const db = loadDb();
    const resolvedRunId = resolveRunId(db, runId, {
      latest: Boolean(options.latest) || !runId,
      includeChildren: Boolean(options.all),
    });
    const detail = getRunDetail(db, resolvedRunId);
    writeOutput(
      {
        runId: resolvedRunId,
        spans: traceSpanSummaries(buildTraceSpans(detail), {
          includeContent: Boolean(options.includeContent),
          maxChars: options.maxChars,
          full: Boolean(options.full),
        }),
      },
      { full: Boolean(options.full) },
    );
  });

program
  .command('events <stepId>')
  .description('Summarize raw response or chunk stream events for a step.')
  .option('--chunks', 'Inspect raw chunks instead of raw response events.')
  .option('--type <type>', 'Filter events by type.')
  .option(
    '--last <number>',
    'Number of last events.',
    parsePositiveIntOption,
    20,
  )
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parsePositiveIntOption,
    500,
  )
  .action((stepId, options) => {
    const db = loadDb();
    const step = findStep(db, stepId);
    if (!step) fail(`Step not found: ${stepId}`);
    writeOutput(
      eventsForStep(step, {
        source: options.chunks ? 'chunks' : 'response',
        type: options.type,
        limit: options.last,
        maxChars: options.maxChars,
      }),
    );
  });

function loadDb() {
  try {
    const globals = getGlobals();
    return readDatabase(globals.file, { maxBytes: globals.maxFileBytes });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function queryOrFail<T>(query: () => T): T {
  try {
    return query();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function resolveRunId(
  db: ReturnType<typeof readDatabase>,
  runId: string | undefined,
  options: { latest?: boolean; includeChildren?: boolean },
): string {
  if (options.latest || !runId) {
    const latest = findLatestRun(db, {
      includeChildren: options.includeChildren,
    });
    if (!latest) fail('No runs found.');
    return latest.id;
  }
  if (!findRunById(db, runId)) fail(`Run not found: ${runId}`);
  return runId;
}

function findRunById(
  db: ReturnType<typeof readDatabase>,
  runId: string,
): boolean {
  return db.runs.some((run) => run.id === runId);
}

function getGlobals(): GlobalOptions {
  return program.opts<GlobalOptions>();
}

function writeOutput(
  value: unknown,
  options: { forceJson?: boolean; full?: boolean } = {},
): void {
  const globals = getGlobals();
  const policyOptions = {
    full: options.full,
    maxOutputChars: globals.maxOutputChars,
  };
  const bounded = boundOutputValue(value, policyOptions);
  if (globals.text && !options.forceJson) {
    console.log(
      boundRenderedText(renderText(bounded), {
        full: options.full,
        maxOutputChars: globals.maxOutputChars,
      }),
    );
    return;
  }
  console.log(
    stringifyBoundedOutput(value, {
      ...policyOptions,
      pretty: globals.pretty,
    }),
  );
}

function hasSubcommandFlag(commandName: string, flag: string): boolean {
  const commandIndex = process.argv.findIndex((arg) => arg === commandName);
  return (
    commandIndex >= 0 && process.argv.slice(commandIndex + 1).includes(flag)
  );
}

function parsePositiveIntOption(value: string): number {
  const parsed = parseIntegerOption(value);
  if (parsed <= 0) throw new Error(`Expected a positive integer: ${value}`);
  return parsed;
}

function parseOutputLimitOption(value: string): number {
  const parsed = parsePositiveIntOption(value);
  if (parsed < 256)
    throw new Error(`Expected at least 256 output characters: ${value}`);
  return parsed;
}

function parseNonNegativeIntOption(value: string): number {
  const parsed = parseIntegerOption(value);
  if (parsed < 0) throw new Error(`Expected a non-negative integer: ${value}`);
  return parsed;
}

function parseIntegerOption(value: string): number {
  if (!/^-?\d+$/.test(value)) throw new Error(`Invalid integer: ${value}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new Error(`Invalid integer: ${value}`);
  return parsed;
}

function parseIsoDateOption(value: string): string {
  if (!Number.isFinite(new Date(value).getTime())) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return value;
}

function parseMessageRole(value: string): string {
  return parseChoice(value, ['user', 'assistant', 'system', 'tool'], 'role');
}

function parseStepSection(value: string): string {
  return parseChoice(
    value,
    ['input', 'output', 'config', 'usage', 'raw', 'all'],
    'section',
  );
}

function parseMessageParts(value: string): string {
  const allowed = [
    'text',
    'reasoning',
    'tool-calls',
    'tool-results',
    'attachments',
    'unknown',
  ];
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0)
    throw new Error('Expected at least one message part.');
  for (const part of parts) parseChoice(part, allowed, 'message part');
  return [...new Set(parts)].join(',');
}

function parseChoice(value: string, allowed: string[], label: string): string {
  if (!allowed.includes(value)) {
    throw new Error(
      `Invalid ${label}: ${value}. Expected one of: ${allowed.join(', ')}`,
    );
  }
  return value;
}

function filterRunSummary(
  run: Record<string, unknown>,
  options: Record<string, unknown>,
): boolean {
  if (options.errors && !run.hasError) return false;
  if (options.inProgress && !run.isInProgress) return false;
  if (typeof options.model === 'string') {
    const models = Array.isArray(run.models) ? run.models.map(String) : [];
    if (!models.some((model) => model.includes(options.model as string)))
      return false;
  }
  if (typeof options.provider === 'string') {
    const providers = Array.isArray(run.providers)
      ? run.providers.map(String)
      : [];
    if (
      !providers.some((provider) =>
        provider.includes(options.provider as string),
      )
    )
      return false;
  }
  return true;
}

function filterRunMetadata(
  run: { function_id?: string | null; started_at: string },
  options: Record<string, unknown>,
): boolean {
  if (
    typeof options.function === 'string' &&
    !String(run.function_id ?? '').includes(options.function)
  )
    return false;
  const startedAt = new Date(run.started_at).getTime();
  if (
    typeof options.since === 'string' &&
    startedAt < new Date(options.since).getTime()
  )
    return false;
  if (
    typeof options.until === 'string' &&
    startedAt > new Date(options.until).getTime()
  )
    return false;
  return true;
}

function limitMaybe(value: unknown, maxChars: number, full: boolean): unknown {
  return full ? value : limitStrings(value, maxChars);
}

function limitStrings(value: unknown, maxChars: number): unknown {
  if (typeof value === 'string') return preview(value, maxChars);
  if (Array.isArray(value))
    return value.map((item) => limitStrings(item, maxChars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        limitStrings(child, maxChars),
      ]),
    );
  }
  return value;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
