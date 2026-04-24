#!/usr/bin/env node
import { Command } from 'commander';
import {
  findRun,
  findStep,
  getMessagesForRun,
  getRunDetail,
  outputForStep,
  rawForStep,
  readDatabase,
  runDetailSummary,
  resolveDbPath,
  stepSummary,
  stepsForRun,
  summarizeRun,
  toolsForTarget,
  usageForTarget,
  buildTraceSpans,
  getByPath,
  parseJson,
  preview,
} from './generations.js';

interface GlobalOptions {
  file?: string;
  pretty?: boolean;
  text?: boolean;
}

const program = new Command();

program
  .name('aisdk-dt')
  .description(
    'Query AI SDK DevTools generations.json files without flooding context.',
  )
  .option(
    '--file <path>',
    'Path to generations.json. Defaults to .devtools/generations.json.',
  )
  .option('--pretty', 'Pretty-print JSON output.')
  .option('--text', 'Render a compact human-readable output.');

program
  .command('runs')
  .description('List recent runs.')
  .option('--limit <number>', 'Number of runs to return.', parseIntOption, 20)
  .option('--offset <number>', 'Number of runs to skip.', parseIntOption, 0)
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
  .option('--since <iso>', 'Only include runs started at or after this time.')
  .option('--until <iso>', 'Only include runs started at or before this time.')
  .action((options) => {
    const db = loadDb();
    const rows = db.runs
      .filter((run) => options.all || !run.parent_run_id)
      .sort(
        (a, b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
      )
      .map((run) => summarizeRun(db, run, Boolean(options.children)))
      .filter((run) => filterRunSummary(run, options))
      .slice(options.offset, options.offset + options.limit);
    writeOutput({ dbPath: resolveDbPath(getGlobals().file), runs: rows });
  });

program
  .command('run <runId>')
  .description('Show compact run detail.')
  .option('--include-children', 'Include nested child runs.')
  .option('--timeline', 'Include timeline spans.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parseIntOption,
    500,
  )
  .action((runId, options) => {
    const db = loadDb();
    const result = limitStrings(
      runDetailSummary(db, runId, {
        includeChildren: Boolean(options.includeChildren),
        timeline: Boolean(options.timeline),
      }),
      options.maxChars,
    );
    writeOutput(result);
  });

program
  .command('steps <runId>')
  .description('List collapsed step-card summaries for a run.')
  .action((runId) => {
    const db = loadDb();
    const run = findRun(db, runId);
    if (!run) fail(`Run not found: ${runId}`);
    const steps = stepsForRun(db, runId);
    writeOutput({
      runId,
      steps: steps.map((step) => stepSummary(step, steps)),
    });
  });

program
  .command('step <stepId>')
  .description('Inspect one step safely.')
  .option(
    '--section <section>',
    'input, output, config, usage, raw, or all.',
    'all',
  )
  .option('--field <field>', 'A raw step field to inspect.')
  .option('--json-path <path>', 'Dot/bracket path inside the selected data.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parseIntOption,
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
      writeOutput({
        stepId,
        field: options.field,
        value: options.full ? selected : preview(selected, options.maxChars),
      });
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
    writeOutput(limitMaybe(selected, options.maxChars, options.full));
  });

program
  .command('messages <runId>')
  .description('Extract bounded prompt transcript messages.')
  .option('--limit <number>', 'Number of latest messages.', parseIntOption)
  .option('--role <role>', 'Filter by role: user, assistant, system, or tool.')
  .option(
    '--parts <parts>',
    'Comma-separated parts: text,reasoning,tool-calls,tool-results.',
  )
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parseIntOption,
    500,
  )
  .action((runId, options) => {
    const db = loadDb();
    if (!findRun(db, runId)) fail(`Run not found: ${runId}`);
    writeOutput({
      runId,
      messages: getMessagesForRun(db, runId, {
        limit: options.limit,
        role: options.role,
        parts: options.parts,
        maxChars: options.maxChars,
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
    parseIntOption,
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
      { forceJson: textOnly },
    );
  });

program
  .command('tools <targetId>')
  .description(
    'Query available tools, tool calls, and tool results for a run or step.',
  )
  .option('--tool-call-id <id>', 'Filter by toolCallId.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parseIntOption,
    500,
  )
  .option('--full', 'Emit complete selected data.')
  .action((targetId, options) => {
    writeOutput(
      limitMaybe(
        toolsForTarget(loadDb(), targetId, { toolCallId: options.toolCallId }),
        options.maxChars,
        Boolean(options.full),
      ),
    );
  });

program
  .command('usage <targetId>')
  .description('Show token usage for a run or step.')
  .action((targetId) => {
    writeOutput(usageForTarget(loadDb(), targetId));
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
    parseIntOption,
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
    );
  });

program
  .command('timeline <runId>')
  .description('Emit trace timeline spans for a run.')
  .action((runId) => {
    const db = loadDb();
    const detail = getRunDetail(db, runId);
    writeOutput({ runId, spans: buildTraceSpans(detail) });
  });

program.parse();

function loadDb() {
  try {
    return readDatabase(getGlobals().file);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function getGlobals(): GlobalOptions {
  return program.opts<GlobalOptions>();
}

function writeOutput(
  value: unknown,
  options: { forceJson?: boolean } = {},
): void {
  const globals = getGlobals();
  if (globals.text && !options.forceJson) {
    console.log(renderText(value));
    return;
  }
  console.log(JSON.stringify(value, null, globals.pretty ? 2 : 0));
}

function hasSubcommandFlag(commandName: string, flag: string): boolean {
  const commandIndex = process.argv.findIndex((arg) => arg === commandName);
  return (
    commandIndex >= 0 && process.argv.slice(commandIndex + 1).includes(flag)
  );
}

function renderText(value: unknown): string {
  if (Array.isArray(value))
    return value.map((item) => renderText(item)).join('\n');
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.runs)) {
      return obj.runs
        .map((run) => {
          const row = run as Record<string, unknown>;
          return `${row.id} ${row.startedAt} ${row.firstMessage} steps=${row.stepCount} error=${row.hasError}`;
        })
        .join('\n');
    }
    if (Array.isArray(obj.steps)) {
      return obj.steps
        .map((step) => {
          const row = step as Record<string, unknown>;
          return `${row.stepNumber ?? ''} ${row.id} ${row.modelId ?? ''} ${JSON.stringify(row.outputSummary)}`;
        })
        .join('\n');
    }
  }
  return JSON.stringify(value, null, 2);
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`);
  return parsed;
}

function filterRunSummary(
  run: Record<string, unknown>,
  options: Record<string, unknown>,
): boolean {
  if (options.errors && !run.hasError) return false;
  if (options.inProgress && !run.isInProgress) return false;
  if (
    typeof options.function === 'string' &&
    !String(run.functionId ?? '').includes(options.function)
  )
    return false;
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
  const startedAt = new Date(String(run.startedAt)).getTime();
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
