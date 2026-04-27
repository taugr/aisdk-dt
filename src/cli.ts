#!/usr/bin/env node
import { Command } from 'commander';
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
    'Inspect AI SDK DevTools generations.json files for LLM-friendly debugging.',
  )
  .option(
    '--file <path>',
    'Path to generations.json. Defaults to .devtools/generations.json.',
  )
  .option('--pretty', 'Pretty-print JSON output.')
  .option('--text', 'Render a compact human-readable output.')
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
  .description(
    'Inspect a run with recent messages, tools, usage, and timeline.',
  )
  .option('--latest', 'Inspect the latest root run.')
  .option('--all', 'Allow --latest to select child runs.')
  .option(
    '--messages <number>',
    'Number of recent messages to include.',
    parseIntOption,
  )
  .option('--include-system', 'Include system messages in message output.')
  .option('--usage-per-message', 'Include usage on every rendered message.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parseIntOption,
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
    parseIntOption,
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
      { forceJson: Boolean(options.full) },
    );
  });

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
  .command('run [runId]')
  .description('Show compact run detail.')
  .option('--latest', 'Show the latest root run.')
  .option('--all', 'Allow --latest to select child runs.')
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
  .command('messages [runId]')
  .description(
    'Extract recent bounded transcript messages with usage metadata.',
  )
  .option('--latest', 'Show messages for the latest root run.')
  .option('--all', 'Allow --latest to select child runs.')
  .option('--limit <number>', 'Number of latest messages.', parseIntOption, 12)
  .option('--role <role>', 'Filter by role: user, assistant, system, or tool.')
  .option(
    '--parts <parts>',
    'Comma-separated parts: text,reasoning,tool-calls,tool-results.',
  )
  .option('--include-system', 'Include system messages.')
  .option('--usage-per-message', 'Include usage on every rendered message.')
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parseIntOption,
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
    parseIntOption,
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
        toolsForTarget(db, resolvedTargetId, {
          toolCallId: options.toolCallId,
          includeAvailable: Boolean(options.available),
          availableOnly: Boolean(options.availableOnly),
        }),
        options.maxChars,
        Boolean(options.full),
      ),
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
    writeOutput(usageForTarget(db, resolvedTargetId));
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
  .command('timeline [runId]')
  .description('Emit trace timeline spans for a run.')
  .option('--latest', 'Show timeline for the latest root run.')
  .option('--all', 'Allow --latest to select child runs.')
  .action((runId, options) => {
    const db = loadDb();
    const resolvedRunId = resolveRunId(db, runId, {
      latest: Boolean(options.latest) || !runId,
      includeChildren: Boolean(options.all),
    });
    const detail = getRunDetail(db, resolvedRunId);
    writeOutput({ runId: resolvedRunId, spans: buildTraceSpans(detail) });
  });

program
  .command('events <stepId>')
  .description('Summarize raw response or chunk stream events for a step.')
  .option('--chunks', 'Inspect raw chunks instead of raw response events.')
  .option('--type <type>', 'Filter events by type.')
  .option('--last <number>', 'Number of last events.', parseIntOption, 20)
  .option(
    '--max-chars <number>',
    'Maximum preview characters.',
    parseIntOption,
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

program.parse();

function loadDb() {
  try {
    return readDatabase(getGlobals().file);
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
    if (obj.run && obj.usage) {
      return renderInspectionText(obj);
    }
    if (hasOwn(obj, 'finalOutput')) {
      return renderFinalOutputText(obj);
    }
    if (obj.targetType === 'run' && Array.isArray(obj.steps) && obj.usage) {
      return renderUsageText(obj);
    }
    if (obj.targetType === 'step' && obj.usage) {
      return renderUsageText(obj);
    }
    if (obj.runId && Array.isArray(obj.messages)) {
      return renderMessagesText(obj);
    }
    if (obj.runId && Array.isArray(obj.spans)) {
      return renderTimelineText(obj);
    }
    if (obj.calls && obj.results && obj.summary) {
      return renderToolsText(obj);
    }
    if (obj.events && obj.typeCounts) {
      return renderEventsText(obj);
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

function renderInspectionText(obj: Record<string, unknown>): string {
  const run = obj.run as Record<string, unknown>;
  const usage = obj.usage as Record<string, unknown>;
  const narrative = obj.narrative as Record<string, unknown> | undefined;
  const diagnostics = obj.diagnostics as Record<string, unknown> | undefined;
  const lines = [
    `run ${run.id} status=${run.status} started=${run.startedAt}`,
    `model=${formatList(run.models)} provider=${formatList(run.providers)} steps=${run.stepCount} durationMs=${run.durationMs}`,
    renderUsageSummary(usage),
  ];
  if (narrative?.summary) lines.push(`summary=${narrative.summary}`);
  if (obj.tools && typeof obj.tools === 'object') {
    const tools = obj.tools as Record<string, unknown>;
    const summary = tools.summary as Record<string, unknown> | undefined;
    if (summary)
      lines.push(
        `tools=calls:${summary.toolCallCount ?? 0} pairedResults:${summary.pairedToolResultCount ?? summary.toolResultCount ?? 0} replayedResults:${summary.replayedToolResultCount ?? 0}`,
      );
  }
  if (narrative && hasOwn(narrative, 'finalOutput'))
    lines.push(
      `finalOutput=${renderFinalOutput(narrative?.finalOutput as Record<string, unknown> | null)}`,
    );
  if (run.error) lines.push(`error=${run.error}`);
  if (diagnostics?.likelyFailurePoint)
    lines.push(`likelyFailurePoint=${diagnostics.likelyFailurePoint}`);
  if (narrative?.diagnosis) lines.push(`diagnosis=${narrative.diagnosis}`);
  if (Array.isArray(obj.timeline)) {
    lines.push('', 'timeline:');
    lines.push(
      ...renderTimelineLines(obj.timeline as Array<Record<string, unknown>>),
    );
  }
  if (Array.isArray(obj.recentMessages)) {
    lines.push('', 'recent messages:');
    for (const message of obj.recentMessages as Array<
      Record<string, unknown>
    >) {
      lines.push(renderMessageLine(message));
    }
  }
  if (
    diagnostics?.recentEvents &&
    typeof diagnostics.recentEvents === 'object'
  ) {
    lines.push('', 'diagnostic events:');
    lines.push(
      renderEventsText(diagnostics.recentEvents as Record<string, unknown>),
    );
  }
  return lines.join('\n');
}

function renderUsageText(obj: Record<string, unknown>): string {
  const usage = obj.usage as Record<string, unknown>;
  const lines = [
    obj.targetType === 'run'
      ? `run ${obj.runId} steps=${obj.stepCount}`
      : `step ${obj.stepId}`,
    renderUsageSummary(usage),
  ];
  if (Array.isArray(obj.steps)) {
    for (const step of obj.steps as Array<Record<string, unknown>>) {
      lines.push(
        `${step.stepNumber} ${step.stepId} ${renderUsageSummary(step.usage as Record<string, unknown>)}`,
      );
    }
  }
  return lines.join('\n');
}

function renderUsageSummary(usage: Record<string, unknown>): string {
  const input = usage.input as Record<string, unknown> | undefined;
  const output = usage.output as Record<string, unknown> | undefined;
  const cacheRead = numberValue(input?.cacheRead);
  const inputTotal = numberValue(input?.total);
  const cacheHit =
    inputTotal > 0 && cacheRead != null
      ? ` cacheHit=${((cacheRead / inputTotal) * 100).toFixed(1)}%`
      : '';
  return `input=${inputTotal} noCache=${input?.noCache ?? 0} cacheRead=${input?.cacheRead ?? 0}${cacheHit} output=${output?.total ?? 0} text=${output?.text ?? 0} reasoning=${output?.reasoning ?? 0}`;
}

function renderToolsText(obj: Record<string, unknown>): string {
  const summary = obj.summary as Record<string, unknown>;
  const lines = [
    `${obj.targetType} ${obj.targetId} calls=${summary.toolCallCount} pairedResults=${summary.pairedToolResultCount ?? summary.toolResultCount} replayedResults=${summary.replayedToolResultCount ?? 0} available=${summary.availableToolCount}`,
  ];
  for (const call of obj.calls as Array<Record<string, unknown>>) {
    lines.push(
      `call ${call.relationship ?? 'tool-call'} step=${call.stepNumber} ${call.toolName} id=${call.toolCallId ?? ''} input=${truncateRendered(call.input)}`,
    );
  }
  for (const result of obj.results as Array<Record<string, unknown>>) {
    const relationship =
      result.relationship === 'replayed-context'
        ? `replayed-context originalCallStep=${result.originalCallStepNumber ?? 'outside-run'} replayedFromStep=${result.replayedFromStepNumber ?? result.sourceStepNumber ?? ''} observedStep=${result.observedInStepNumber ?? ''}`
        : `paired-next-step originalCallStep=${result.originalCallStepNumber ?? result.sourceStepNumber ?? ''} observedStep=${result.observedInStepNumber ?? ''}`;
    lines.push(
      `result ${relationship} ${result.toolName ?? ''} id=${result.toolCallId ?? ''} output=${truncateRendered(result.output)}`,
    );
  }
  if (Array.isArray(obj.available)) {
    for (const tool of obj.available as Array<Record<string, unknown>>) {
      lines.push(`available ${tool.name}`);
    }
  }
  return lines.join('\n');
}

function renderFinalOutputText(obj: Record<string, unknown>): string {
  const output = obj.finalOutput as Record<string, unknown> | null;
  if (!output) return `run ${obj.runId} finalOutput=null`;
  return [`run ${obj.runId}`, `finalOutput=${renderFinalOutput(output)}`].join(
    '\n',
  );
}

function renderEventsText(obj: Record<string, unknown>): string {
  const diagnosis = obj.diagnosis as Record<string, unknown> | undefined;
  const lines = [
    `step ${obj.stepId} source=${obj.source} events=${obj.totalEventCount} filtered=${obj.filteredEventCount}`,
    `types=${JSON.stringify(obj.typeCounts)}`,
  ];
  if (diagnosis?.likelyFailure)
    lines.push(`diagnosis=${diagnosis.likelyFailure}`);
  if (diagnosis) {
    lines.push(
      `streamStarted=${diagnosis.streamStarted} responseMetadataSeen=${diagnosis.responseMetadataSeen} toolInputCompleted=${diagnosis.toolInputCompleted} terminalEventSeen=${diagnosis.terminalEventSeen}`,
    );
    if (diagnosis.toolInputStarted)
      lines.push(
        `toolInputStarted=${truncateRendered(diagnosis.toolInputStarted)}`,
      );
    if (diagnosis.toolInputPartial)
      lines.push(
        `toolInputPartial=${truncateRendered(diagnosis.toolInputPartial)}`,
      );
  }
  for (const event of obj.events as Array<Record<string, unknown>>) {
    lines.push(`${event.index}: ${truncateRendered(event.value)}`);
  }
  return lines.join('\n');
}

function renderMessagesText(obj: Record<string, unknown>): string {
  const lines = [
    `run ${obj.runId} messages=${(obj.messages as unknown[]).length}`,
  ];
  for (const message of obj.messages as Array<Record<string, unknown>>) {
    lines.push(renderMessageLine(message));
  }
  return lines.join('\n');
}

function renderTimelineText(obj: Record<string, unknown>): string {
  return [
    `run ${obj.runId} spans=${(obj.spans as unknown[]).length}`,
    ...renderTimelineLines(obj.spans as Array<Record<string, unknown>>),
  ].join('\n');
}

function renderTimelineLines(spans: Array<Record<string, unknown>>): string[] {
  const lines: string[] = [];
  for (const span of spans) {
    const depth =
      typeof span.depth === 'number' && span.depth > 0
        ? '  '.repeat(span.depth)
        : '';
    const tokens = span.tokens as Record<string, unknown> | undefined;
    const tokenText = tokens
      ? ` input=${tokens.input ?? 0} output=${tokens.output ?? 0}`
      : '';
    lines.push(
      `${span.startMs}ms ${depth}${span.kind} ${span.label}${span.sublabel ? ` ${truncateRendered(span.sublabel, 80)}` : ''} duration=${span.durationMs}ms${tokenText}`,
    );
  }
  return lines;
}

function renderMessageLine(message: Record<string, unknown>): string {
  const text = truncateRendered(message.text);
  const calls = message.toolCalls as Array<Record<string, unknown>>;
  const results = message.toolResults as Array<Record<string, unknown>>;
  const parts = [
    `[step ${message.stepNumber} message ${message.index}] ${message.role}`,
  ];
  if (text) parts.push(`text=${text}`);
  for (const call of calls) {
    parts.push(
      `tool-call ${call.toolName} id=${call.toolCallId ?? ''} args=${truncateRendered(call.args)}`,
    );
  }
  for (const result of results) {
    parts.push(
      `tool-result ${result.toolName ?? ''} id=${result.toolCallId ?? ''} result=${truncateRendered(result.result)}`,
    );
  }
  if (message.stepUsage)
    parts.push(
      renderUsageSummary(message.stepUsage as Record<string, unknown>),
    );
  return parts.join(' ');
}

function renderFinalOutput(output: Record<string, unknown> | null): string {
  if (!output) return 'null';
  const location = `step=${output.stepNumber ?? ''}`;
  if (output.type === 'step-output') {
    const parts = [`step-output ${location}`];
    if (output.text) parts.push(`text=${truncateRendered(output.text, 500)}`);
    if (output.objectText)
      parts.push(`objectText=${truncateRendered(output.objectText, 500)}`);
    if (output.response)
      parts.push(`response=${truncateRendered(output.response, 500)}`);
    const calls = Array.isArray(output.toolCalls)
      ? (output.toolCalls as Array<Record<string, unknown>>)
      : [];
    if (calls.length > 0) {
      parts.push(
        `toolCalls=${calls
          .map(
            (call) =>
              `${call.toolName ?? 'tool'} id=${call.toolCallId ?? ''} args=${truncateRendered(call.args)} result=${truncateRendered(call.result)}`,
          )
          .join('; ')}`,
      );
    }
    return parts.join(' ');
  }
  return `${String(output.type ?? 'output')} ${location} value=${truncateRendered(output, 500)}`;
}

function formatList(value: unknown): string {
  return Array.isArray(value) ? value.join(',') : String(value ?? '');
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function truncateRendered(value: unknown, maxChars = 160): string {
  if (value == null || value === '') return '';
  if (
    typeof value === 'object' &&
    value != null &&
    'preview' in value &&
    typeof (value as Record<string, unknown>).preview === 'string'
  ) {
    return truncateRendered(
      (value as Record<string, unknown>).preview,
      maxChars,
    );
  }
  const rendered =
    typeof value === 'string'
      ? value
      : JSON.stringify(value).replace(/\s+/g, ' ');
  return rendered.length > maxChars
    ? `${rendered.slice(0, maxChars).trim()}...`
    : rendered;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : 0;
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
