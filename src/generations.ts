import fs from 'node:fs';
import path from 'node:path';
import {
  databaseSchema,
  parsedInputSchema,
  parsedOutputSchema,
  parsedUsageSchema,
} from './schema.js';
import type {
  ChildRun,
  ContentPart,
  Database,
  InputTokenBreakdown,
  OutputTokenBreakdown,
  ParsedInput,
  ParsedOutput,
  ParsedUsage,
  PromptMessage,
  ReasoningContentPart,
  Run,
  RunDetail,
  Step,
  TextContentPart,
  ToolCallContentPart,
  ToolDefinition,
  ToolResultContentPart,
  TraceSpan,
} from './types.js';

const DEFAULT_MAX_CHARS = 500;
export const DEFAULT_MAX_DATABASE_BYTES = 100 * 1024 * 1024;

interface DatabaseIndex {
  runsById: Map<string, Run>;
  stepsById: Map<string, Step>;
  stepsByRunId: Map<string, Step[]>;
  childRunsByParentId: Map<string, Run[]>;
  runsNewestFirst: Run[];
}

export interface ReadDatabaseOptions {
  maxBytes?: number;
  attempts?: number;
  retryDelayMs?: number;
}

const databaseIndexes = new WeakMap<Database, DatabaseIndex>();
const parsedStepFields = new WeakMap<
  Step,
  Partial<
    Record<
      'input' | 'output' | 'usage' | 'raw_response' | 'raw_chunks',
      unknown
    >
  >
>();

export function resolveDbPath(file?: string): string {
  return path.resolve(
    file ?? path.join(process.cwd(), '.devtools/generations.json'),
  );
}

export function readDatabase(
  file?: string,
  options: ReadDatabaseOptions = {},
): Database {
  const dbPath = resolveDbPath(file);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_DATABASE_BYTES;
  const attempts = options.attempts ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 20;

  let lastSyntaxError: unknown;
  let previousInvalidSignature: string | undefined;
  let attemptsMade = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const fileStat = fs.statSync(dbPath);
    assertDatabaseSize(fileStat.size, maxBytes);
    const content = fs.readFileSync(dbPath, 'utf8');
    assertDatabaseSize(Buffer.byteLength(content), maxBytes);
    attemptsMade += 1;
    const signature = `${fileStat.size}:${fileStat.mtimeMs}`;
    if (previousInvalidSignature === signature) break;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch (error) {
      lastSyntaxError = error;
      previousInvalidSignature = signature;
      if (attempt < attempts) {
        waitSynchronously(retryDelayMs);
        continue;
      }
      break;
    }

    const result = databaseSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Invalid generations database: ${dbPath} (${result.error.issues[0]?.message ?? 'schema mismatch'})`,
      );
    }
    const database = { runs: result.data.runs, steps: result.data.steps };
    indexFor(database);
    return database;
  }

  const detail =
    lastSyntaxError instanceof Error ? ` (${lastSyntaxError.message})` : '';
  throw new Error(
    `Could not parse generations database after ${attemptsMade} read attempts: ${dbPath}. The file may be mid-write; retry shortly.${detail}`,
  );
}

function assertDatabaseSize(size: number, maxBytes: number): void {
  if (size <= maxBytes) return;
  throw new Error(
    `Generations database is ${formatBytes(size)}, exceeding the ${formatBytes(maxBytes)} safety limit. Increase --max-file-bytes to inspect it deliberately.`,
  );
}

function waitSynchronously(milliseconds: number): void {
  if (milliseconds <= 0) return;
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function indexFor(db: Database): DatabaseIndex {
  const cached = databaseIndexes.get(db);
  if (cached) return cached;

  const runsById = new Map<string, Run>();
  const stepsById = new Map<string, Step>();
  const stepsByRunId = new Map<string, Step[]>();
  const childRunsByParentId = new Map<string, Run[]>();

  for (const run of db.runs) {
    runsById.set(run.id, run);
    if (run.parent_run_id) {
      const children = childRunsByParentId.get(run.parent_run_id) ?? [];
      children.push(run);
      childRunsByParentId.set(run.parent_run_id, children);
    }
  }
  for (const step of db.steps) {
    stepsById.set(step.id, step);
    const steps = stepsByRunId.get(step.run_id) ?? [];
    steps.push(step);
    stepsByRunId.set(step.run_id, steps);
  }
  for (const steps of stepsByRunId.values()) {
    steps.sort((a, b) => a.step_number - b.step_number);
  }
  for (const children of childRunsByParentId.values()) {
    children.sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    );
  }

  const index = {
    runsById,
    stepsById,
    stepsByRunId,
    childRunsByParentId,
    runsNewestFirst: [...db.runs].sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    ),
  };
  databaseIndexes.set(db, index);
  return index;
}

export function parseJson<T = unknown>(
  value: string | null | undefined,
): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
}

export function parseInput(
  value: string | null | undefined,
): ParsedInput | null {
  const parsed = parseJson<unknown>(value);
  const result = parsedInputSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function parseOutput(
  value: string | null | undefined,
): ParsedOutput | null {
  const parsed = parseJson<unknown>(value);
  const result = parsedOutputSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function parseUsage(
  value: string | null | undefined,
): ParsedUsage | null {
  const parsed = parseJson<unknown>(value);
  const result = parsedUsageSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

function inputForStep(step: Step): ParsedInput | null {
  return cachedStepField(step, 'input', () => parseInput(step.input));
}

function outputForStepValue(step: Step): ParsedOutput | null {
  return cachedStepField(step, 'output', () => parseOutput(step.output));
}

function usageForStepValue(step: Step): ParsedUsage | null {
  return cachedStepField(step, 'usage', () => parseUsage(step.usage));
}

function rawFieldForStep(
  step: Step,
  field: 'raw_response' | 'raw_chunks',
): unknown {
  return cachedStepField(step, field, () => parseJson(step[field]));
}

function cachedStepField<T>(
  step: Step,
  field: 'input' | 'output' | 'usage' | 'raw_response' | 'raw_chunks',
  parse: () => T,
): T {
  const cached = parsedStepFields.get(step) ?? {};
  if (Object.prototype.hasOwnProperty.call(cached, field)) {
    return cached[field] as T;
  }
  const value = parse();
  cached[field] = value;
  parsedStepFields.set(step, cached);
  return value;
}

export function safeParseValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function preview(value: unknown, maxChars = DEFAULT_MAX_CHARS): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.length > maxChars
      ? {
          preview: value.slice(0, maxChars),
          truncated: true,
          chars: value.length,
        }
      : value;
  }
  const rendered = JSON.stringify(value);
  if (rendered.length <= maxChars) return value;
  return {
    preview: rendered.slice(0, maxChars),
    truncated: true,
    chars: rendered.length,
  };
}

export function truncateText(text: string, maxLength = 80): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

export function fieldMeta(value: string | null | undefined): {
  present: boolean;
  chars: number;
} {
  if (!value) return { present: false, chars: 0 };
  return {
    present: true,
    chars: value.length,
  };
}

export function isInProgress(steps: Step[]): boolean {
  return steps.some((step) => step.duration_ms === null && !step.error);
}

export function stepsForRun(db: Database, runId: string): Step[] {
  return indexFor(db).stepsByRunId.get(runId) ?? [];
}

export function findRun(db: Database, runId: string): Run | undefined {
  return indexFor(db).runsById.get(runId);
}

export function findStep(db: Database, stepId: string): Step | undefined {
  return indexFor(db).stepsById.get(stepId);
}

export function findLatestRun(
  db: Database,
  options: { includeChildren?: boolean } = {},
): Run | undefined {
  return indexFor(db).runsNewestFirst.find(
    (run) => options.includeChildren || !run.parent_run_id,
  );
}

export function runsNewestFirst(db: Database): Run[] {
  return indexFor(db).runsNewestFirst;
}

export function buildChildRuns(db: Database, parentRunId: string): ChildRun[] {
  return buildChildRunsInternal(db, parentRunId, new Set([parentRunId]));
}

function buildChildRunsInternal(
  db: Database,
  parentRunId: string,
  ancestors: Set<string>,
): ChildRun[] {
  const children = indexFor(db).childRunsByParentId.get(parentRunId) ?? [];
  return children.map((run) => {
    const steps = stepsForRun(db, run.id);
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(run.id);
    return {
      run: { ...run, isInProgress: isInProgress(steps) },
      steps,
      childRuns: ancestors.has(run.id)
        ? []
        : buildChildRunsInternal(db, run.id, nextAncestors),
    };
  });
}

export function getRunDetail(db: Database, runId: string): RunDetail {
  const run = findRun(db, runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  const steps = stepsForRun(db, runId);
  return {
    run: { ...run, isInProgress: isInProgress(steps) },
    steps,
    childRuns: buildChildRuns(db, runId),
  };
}

export function textFromContent(
  content: string | ContentPart[] | undefined,
): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part): part is TextContentPart => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

export function reasoningFromContent(
  content: string | ContentPart[] | undefined,
): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (part): part is ReasoningContentPart =>
        part.type === 'thinking' || part.type === 'reasoning',
    )
    .map((part) => part.thinking ?? part.text ?? part.reasoning ?? '')
    .join('');
}

export function toolCallsFromContent(
  content: string | ContentPart[] | undefined,
): ToolCallContentPart[] {
  if (!Array.isArray(content)) return [];
  return content.filter(
    (part): part is ToolCallContentPart => part.type === 'tool-call',
  );
}

export function toolResultsFromContent(
  content: string | ContentPart[] | undefined,
): ToolResultContentPart[] {
  if (!Array.isArray(content)) return [];
  return content.filter(
    (part): part is ToolResultContentPart => part.type === 'tool-result',
  );
}

export function firstUserMessage(steps: Step[], maxChars = 80): string {
  const firstStep = steps[0];
  if (!firstStep) return 'Empty run';
  const input = inputForStep(firstStep);
  const prompt = input?.prompt;
  if (!Array.isArray(prompt)) return 'No user message';
  const userMsg = prompt.find((message) => message.role === 'user');
  const text = textFromContent(userMsg?.content);
  return text ? truncateText(text, maxChars) : 'No user message';
}

export function lastUserMessage(input: ParsedInput | null): string | null {
  const prompt = input?.prompt;
  if (!Array.isArray(prompt)) return null;
  const userMessages = prompt.filter((message) => message.role === 'user');
  const last = userMessages[userMessages.length - 1];
  const text = textFromContent(last?.content);
  return text || null;
}

export function getInputTokenBreakdown(
  tokens: number | InputTokenBreakdown | null | undefined,
): InputTokenBreakdown {
  if (tokens == null) return { total: 0 };
  if (typeof tokens === 'number') return { total: tokens };
  return {
    total: typeof tokens.total === 'number' ? tokens.total : 0,
    ...(typeof tokens.noCache === 'number' ? { noCache: tokens.noCache } : {}),
    ...(typeof tokens.cacheRead === 'number'
      ? { cacheRead: tokens.cacheRead }
      : {}),
    ...(typeof tokens.cacheWrite === 'number'
      ? { cacheWrite: tokens.cacheWrite }
      : {}),
  };
}

export function getOutputTokenBreakdown(
  tokens: number | OutputTokenBreakdown | null | undefined,
): OutputTokenBreakdown {
  if (tokens == null) return { total: 0 };
  if (typeof tokens === 'number') return { total: tokens };
  return {
    total: typeof tokens.total === 'number' ? tokens.total : 0,
    ...(typeof tokens.text === 'number' ? { text: tokens.text } : {}),
    ...(typeof tokens.reasoning === 'number'
      ? { reasoning: tokens.reasoning }
      : {}),
  };
}

export function usageForStep(step: Step): {
  input: InputTokenBreakdown;
  output: OutputTokenBreakdown;
  raw?: unknown;
  full: ParsedUsage | null;
} {
  const usage = usageForStepValue(step);
  return {
    input: getInputTokenBreakdown(usage?.inputTokens),
    output: getOutputTokenBreakdown(usage?.outputTokens),
    ...(usage && 'raw' in usage ? { raw: usage.raw } : {}),
    full: usage,
  };
}

export function addInputBreakdown(
  a: InputTokenBreakdown,
  b: InputTokenBreakdown,
): InputTokenBreakdown {
  return {
    total: a.total + b.total,
    ...(a.noCache !== undefined || b.noCache !== undefined
      ? { noCache: (a.noCache ?? 0) + (b.noCache ?? 0) }
      : {}),
    ...(a.cacheRead !== undefined || b.cacheRead !== undefined
      ? { cacheRead: (a.cacheRead ?? 0) + (b.cacheRead ?? 0) }
      : {}),
    ...(a.cacheWrite !== undefined || b.cacheWrite !== undefined
      ? { cacheWrite: (a.cacheWrite ?? 0) + (b.cacheWrite ?? 0) }
      : {}),
  };
}

export function addOutputBreakdown(
  a: OutputTokenBreakdown,
  b: OutputTokenBreakdown,
): OutputTokenBreakdown {
  return {
    total: a.total + b.total,
    ...(a.text !== undefined || b.text !== undefined
      ? { text: (a.text ?? 0) + (b.text ?? 0) }
      : {}),
    ...(a.reasoning !== undefined || b.reasoning !== undefined
      ? { reasoning: (a.reasoning ?? 0) + (b.reasoning ?? 0) }
      : {}),
  };
}

export function totalsForSteps(steps: Step[]): {
  durationMs: number;
  input: InputTokenBreakdown;
  output: OutputTokenBreakdown;
} {
  return steps.reduce(
    (acc, step) => {
      const usage = usageForStep(step);
      return {
        durationMs: acc.durationMs + (step.duration_ms ?? 0),
        input: addInputBreakdown(acc.input, usage.input),
        output: addOutputBreakdown(acc.output, usage.output),
      };
    },
    { durationMs: 0, input: { total: 0 }, output: { total: 0 } },
  );
}

export function cacheHitRatio(input: InputTokenBreakdown): number | null {
  if (!input.total || input.cacheRead == null) return null;
  return input.cacheRead / input.total;
}

export function getOutputParts(output: ParsedOutput | null): {
  textParts: TextContentPart[];
  reasoningParts: ReasoningContentPart[];
  toolCalls: ToolCallContentPart[];
  otherParts: ContentPart[];
  text: string;
  reasoning: string;
} {
  const content = output?.content ?? [];
  const textParts =
    output?.textParts ??
    content.filter((part): part is TextContentPart => part.type === 'text');
  const reasoningParts =
    output?.reasoningParts ??
    content.filter(
      (part): part is ReasoningContentPart =>
        part.type === 'thinking' || part.type === 'reasoning',
    );
  const toolCalls =
    output?.toolCalls ??
    content.filter(
      (part): part is ToolCallContentPart => part.type === 'tool-call',
    );
  const otherParts = content.filter(
    (part) =>
      part.type !== 'text' &&
      part.type !== 'thinking' &&
      part.type !== 'reasoning' &&
      part.type !== 'tool-call' &&
      part.type !== 'tool-result',
  );
  return {
    textParts,
    reasoningParts,
    toolCalls,
    otherParts,
    text: textParts.map((part) => part.text).join(''),
    reasoning: reasoningParts
      .map((part) => part.text ?? part.thinking ?? part.reasoning ?? '')
      .join(''),
  };
}

export function toolResultsFromNextStep(
  step: Step,
  siblingSteps: Step[],
): ToolResultContentPart[] {
  const index = siblingSteps.findIndex((candidate) => candidate.id === step.id);
  const nextStep = index >= 0 ? siblingSteps[index + 1] : undefined;
  const input = nextStep ? inputForStep(nextStep) : null;
  return (
    input?.prompt
      ?.filter((message) => message.role === 'tool')
      .flatMap((message) => toolResultsFromContent(message.content)) ?? []
  );
}

function nextStep(step: Step, siblingSteps: Step[]): Step | undefined {
  const index = siblingSteps.findIndex((candidate) => candidate.id === step.id);
  return index >= 0 ? siblingSteps[index + 1] : undefined;
}

function summarizeToolCalls(toolCalls: ToolCallContentPart[]): {
  label: string;
  details?: string;
  counts: Record<string, number>;
} {
  const counts = toolCalls.reduce<Record<string, number>>((acc, call) => {
    acc[call.toolName] = (acc[call.toolName] ?? 0) + 1;
    return acc;
  }, {});
  const names = Object.keys(counts);
  const formatted = names.map((name) =>
    counts[name] > 1 ? `${name} (x${counts[name]})` : name,
  );
  return {
    label:
      formatted.length === 0
        ? 'tool calls'
        : formatted.length <= 2
          ? formatted.join(', ')
          : `${formatted[0]}, ${formatted[1]}, ...`,
    ...(formatted.length > 2 ? { details: formatted.join(', ') } : {}),
    counts,
  };
}

export function stepSummary(
  step: Step,
  siblingSteps: Step[] = [],
): Record<string, unknown> {
  const input = inputForStep(step);
  const output = outputForStepValue(step);
  const usage = usageForStep(step);
  const finishReason =
    typeof output?.finishReason === 'string'
      ? output.finishReason
      : output?.finishReason?.unified;
  const parts = getOutputParts(output);
  const toolResults = toolResultsFromNextStep(step, siblingSteps);
  const inputText = lastUserMessage(input);
  const summary =
    step.error != null
      ? { type: 'error', label: 'Error' }
      : finishReason === 'tool-calls'
        ? { type: 'tool-calls', ...summarizeToolCalls(parts.toolCalls) }
        : { type: 'response', label: 'Response' };
  return {
    id: step.id,
    runId: step.run_id,
    stepNumber: step.step_number,
    type: step.type,
    modelId: step.model_id,
    provider: step.provider,
    startedAt: step.started_at,
    durationMs: step.duration_ms,
    isInProgress: step.duration_ms === null && !step.error,
    error: step.error,
    inputSummary: inputText ? truncateText(inputText, 120) : null,
    outputSummary: summary,
    config: {
      temperature: input?.temperature,
      maxOutputTokens: input?.maxOutputTokens,
      topP: input?.topP,
      topK: input?.topK,
      presencePenalty: input?.presencePenalty,
      frequencyPenalty: input?.frequencyPenalty,
      seed: input?.seed,
      toolChoice:
        typeof input?.toolChoice === 'string'
          ? input.toolChoice
          : input?.toolChoice?.type,
      hasResponseFormat: input?.responseFormat != null,
    },
    availableToolCount: input?.tools?.length ?? 0,
    output: {
      finishReason,
      textChars: parts.text.length,
      reasoningChars: parts.reasoning.length,
      toolCallCount: parts.toolCalls.length,
      toolResultCount: toolResults.length,
      otherPartCount: parts.otherParts.length,
      objectTextChars:
        typeof output?.objectText === 'string' ? output.objectText.length : 0,
    },
    usage: { input: usage.input, output: usage.output },
    raw: {
      request: fieldMeta(step.raw_request),
      response: fieldMeta(step.raw_response),
      chunks: fieldMeta(step.raw_chunks),
      providerOptions: fieldMeta(step.provider_options),
    },
  };
}

export function summarizeRun(
  db: Database,
  run: Run,
  includeChildren = false,
): Record<string, unknown> {
  const steps = stepsForRun(db, run.id);
  const totals = totalsForSteps(steps);
  const firstStep = steps[0];
  const models = [
    ...new Set(steps.map((step) => step.model_id).filter(Boolean)),
  ];
  const providers = [
    ...new Set(steps.map((step) => step.provider).filter(Boolean)),
  ];
  const childRuns = indexFor(db).childRunsByParentId.get(run.id) ?? [];
  return {
    id: run.id,
    startedAt: run.started_at,
    parentRunId: run.parent_run_id ?? null,
    parentStepId: run.parent_step_id ?? null,
    functionId: run.function_id ?? null,
    firstMessage: firstUserMessage(steps),
    stepCount: steps.length,
    childRunCount: childRuns.length,
    type: firstStep?.type,
    models,
    providers,
    hasError: steps.some((step) => step.error),
    isInProgress: isInProgress(steps),
    durationMs: totals.durationMs,
    tokens: { input: totals.input, output: totals.output },
    ...(includeChildren
      ? { childRunIds: childRuns.map((child) => child.id) }
      : {}),
  };
}

export function runDetailSummary(
  db: Database,
  runId: string,
  options: { includeChildren?: boolean; timeline?: boolean } = {},
): Record<string, unknown> {
  const detail = getRunDetail(db, runId);
  const totals = totalsForSteps(detail.steps);
  return {
    run: summarizeRun(db, detail.run, true),
    totals: {
      durationMs: totals.durationMs,
      tokens: { input: totals.input, output: totals.output },
    },
    steps: detail.steps.map((step) => stepSummary(step, detail.steps)),
    ...(options.includeChildren
      ? { childRuns: detail.childRuns.map((child) => serializeChildRun(child)) }
      : {}),
    ...(options.timeline
      ? { timeline: traceSpanSummaries(buildTraceSpans(detail)) }
      : {}),
  };
}

export function inspectRun(
  db: Database,
  runId: string,
  options: {
    recentMessages?: number;
    includeMessages?: boolean;
    includeSystemMessages?: boolean;
    usagePerMessage?: boolean;
    maxChars?: number;
    includeEvents?: boolean;
    eventLimit?: number;
  } = {},
): Record<string, unknown> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const detail = getRunDetail(db, runId);
  const steps = detail.steps;
  const totals = totalsForSteps(steps);
  const runSummary = summarizeRun(db, detail.run, true);
  const lastStep = steps[steps.length - 1];
  const errorStep = [...steps].reverse().find((step) => step.error);
  const status = detail.run.isInProgress
    ? 'in-progress'
    : errorStep
      ? 'error'
      : 'success';
  const toolData = toolsForTarget(db, runId, { includeAvailable: false });
  const inspectionTools = toolDataForInspection(toolData, maxChars);
  const finalOutput = finalOutputForRun(db, runId, { maxChars });
  const eventDiagnostics =
    options.includeEvents && errorStep
      ? eventsForStep(errorStep, {
          limit: options.eventLimit ?? 12,
          maxChars,
        })
      : null;
  return {
    run: {
      id: detail.run.id,
      startedAt: detail.run.started_at,
      functionId: detail.run.function_id ?? null,
      status,
      error: errorStep?.error ?? null,
      stepCount: steps.length,
      durationMs: totals.durationMs,
      models: runSummary.models,
      providers: runSummary.providers,
      firstMessage: runSummary.firstMessage,
      childRunCount: runSummary.childRunCount,
    },
    usage: {
      input: totals.input,
      output: totals.output,
      cacheHitRatio: cacheHitRatio(totals.input),
    },
    steps: steps.map((step) => {
      const summary = stepSummary(step, steps);
      return {
        stepNumber: step.step_number,
        stepId: step.id,
        modelId: step.model_id,
        provider: step.provider,
        durationMs: step.duration_ms,
        status:
          step.duration_ms === null && !step.error
            ? 'in-progress'
            : step.error
              ? 'error'
              : 'complete',
        error: step.error,
        outputSummary: summary.outputSummary,
        usage: summary.usage,
      };
    }),
    ...(options.includeMessages
      ? {
          recentMessages: getMessagesForRun(db, runId, {
            limit: options.recentMessages ?? 12,
            maxChars,
            withUsage: Boolean(options.usagePerMessage),
            includeSystem: Boolean(options.includeSystemMessages),
          }),
        }
      : {}),
    tools: inspectionTools,
    narrative: buildNarrative({
      status,
      steps,
      toolData,
      finalOutput,
      errorStep,
      eventDiagnostics,
      maxChars,
    }),
    timeline: traceSpanSummaries(buildTraceSpans(detail)),
    diagnostics: {
      lastStepId: lastStep?.id ?? null,
      failureStepId: errorStep?.id ?? null,
      failureStepNumber: errorStep?.step_number ?? null,
      likelyFailurePoint: errorStep
        ? `step ${errorStep.step_number}: ${errorStep.error}`
        : null,
      ...(eventDiagnostics ? { recentEvents: eventDiagnostics } : {}),
    },
  };
}

export function traceSpanSummaries(
  spans: TraceSpan[],
  options: { includeContent?: boolean; full?: boolean; maxChars?: number } = {},
): Array<Record<string, unknown>> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  return spans.map((span) => ({
    kind: span.kind,
    stepId: span.stepId,
    label: span.label,
    sublabel: span.sublabel,
    startMs: span.startMs,
    durationMs: span.durationMs,
    depth: span.depth,
    tokens: span.tokens,
    modelId: span.modelId,
    toolCallId: span.toolCallId,
    isInProgress: span.isInProgress,
    ...(options.includeContent || options.full
      ? {
          thinkingText: options.full
            ? span.thinkingText
            : preview(span.thinkingText, maxChars),
          textContent: options.full
            ? span.textContent
            : preview(span.textContent, maxChars),
        }
      : {}),
  }));
}

function toolDataForInspection(
  toolData: Record<string, unknown>,
  maxChars: number,
): Record<string, unknown> {
  const calls = Array.isArray(toolData.calls)
    ? (toolData.calls as Array<Record<string, unknown>>)
    : [];
  const results = Array.isArray(toolData.results)
    ? (toolData.results as Array<Record<string, unknown>>)
    : [];
  const limit = 20;
  return {
    targetType: toolData.targetType,
    targetId: toolData.targetId,
    calls: calls.slice(-limit).map((call) => ({
      stepId: call.stepId,
      stepNumber: call.stepNumber,
      toolName: call.toolName,
      toolCallId: call.toolCallId,
      relationship: call.relationship,
      args: preview(safeParseValue(call.args ?? call.input), maxChars),
    })),
    results: results.slice(-limit).map((result) => ({
      sourceStepId: result.sourceStepId,
      sourceStepNumber: result.sourceStepNumber,
      originalCallStepId: result.originalCallStepId,
      originalCallStepNumber: result.originalCallStepNumber,
      observedInStepId: result.observedInStepId,
      observedInStepNumber: result.observedInStepNumber,
      toolName: result.toolName,
      toolCallId: result.toolCallId,
      relationship: result.relationship,
      result: preview(safeParseValue(result.result ?? result.output), maxChars),
    })),
    summary: {
      ...(toolData.summary as Record<string, unknown>),
      returnedToolCallCount: Math.min(calls.length, limit),
      returnedToolResultCount: Math.min(results.length, limit),
      omittedToolCallCount: Math.max(0, calls.length - limit),
      omittedToolResultCount: Math.max(0, results.length - limit),
    },
  };
}

function buildNarrative({
  status,
  steps,
  toolData,
  finalOutput,
  errorStep,
  eventDiagnostics,
  maxChars,
}: {
  status: string;
  steps: Step[];
  toolData: Record<string, unknown>;
  finalOutput: Record<string, unknown> | null;
  errorStep?: Step;
  eventDiagnostics: Record<string, unknown> | null;
  maxChars: number;
}): Record<string, unknown> {
  const calls = (toolData.calls ?? []) as Array<Record<string, unknown>>;
  const pairedResults = (
    (toolData.results ?? []) as Array<Record<string, unknown>>
  ).filter((result) => result.relationship === 'paired-next-step');
  const toolSequence = calls.map((call) => {
    const result = pairedResults.find(
      (candidate) => candidate.toolCallId === call.toolCallId,
    );
    return {
      stepNumber: call.stepNumber,
      toolName: call.toolName,
      toolCallId: call.toolCallId,
      args: preview(safeParseValue(call.args ?? call.input), maxChars),
      result:
        result == null
          ? null
          : preview(safeParseValue(result.result ?? result.output), maxChars),
    };
  });
  const diagnosis =
    (eventDiagnostics?.diagnosis as Record<string, unknown> | undefined)
      ?.likelyFailure ??
    (errorStep ? `step ${errorStep.step_number}: ${errorStep.error}` : null);
  const summary =
    status === 'success'
      ? buildSuccessSummary(steps, calls)
      : errorStep
        ? `Run ${status} at step ${errorStep.step_number}: ${errorStep.error}.`
        : `Run status is ${status}.`;
  return {
    summary,
    finalOutput,
    toolSequence,
    diagnosis,
  };
}

export function finalOutputForRun(
  db: Database,
  runId: string,
  options: { maxChars?: number; full?: boolean } = {},
): Record<string, unknown> | null {
  const maxChars = options.maxChars ?? 2000;
  const steps = stepsForRun(db, runId);
  for (const step of [...steps].reverse()) {
    const output = outputForStepValue(step);
    if (!output) continue;
    const parts = getOutputParts(output);
    const hasText = parts.text.length > 0;
    const hasObjectText = Boolean(output.objectText);
    const hasToolCalls = parts.toolCalls.length > 0;
    const hasResponse = output.response !== undefined;
    if (!hasText && !hasObjectText && !hasToolCalls && !hasResponse) continue;
    const base = {
      runId,
      stepId: step.id,
      stepNumber: step.step_number,
      finishReason: output.finishReason ?? null,
    };
    const results = hasToolCalls ? toolResultsFromNextStep(step, steps) : [];
    return {
      ...base,
      type: 'step-output',
      ...(hasText
        ? { text: options.full ? parts.text : preview(parts.text, maxChars) }
        : {}),
      ...(hasObjectText
        ? {
            objectText: options.full
              ? output.objectText
              : preview(output.objectText, maxChars),
          }
        : {}),
      ...(hasToolCalls
        ? {
            toolCalls: parts.toolCalls.map((call) => {
              const result = call.toolCallId
                ? results.find(
                    (candidate) => candidate.toolCallId === call.toolCallId,
                  )
                : undefined;
              const args = safeParseValue(call.args ?? call.input);
              const output = safeParseValue(result?.result ?? result?.output);
              return {
                toolName: call.toolName,
                toolCallId: call.toolCallId,
                args: options.full ? args : preview(args, maxChars),
                result: options.full ? output : preview(output, maxChars),
              };
            }),
          }
        : {}),
      ...(hasResponse
        ? {
            response: options.full
              ? output.response
              : preview(output.response, maxChars),
          }
        : {}),
    };
  }
  return null;
}

function buildSuccessSummary(
  steps: Step[],
  calls: Array<Record<string, unknown>>,
): string {
  if (calls.length === 0)
    return `Successful ${steps.length}-step run with no tool calls.`;
  const names = calls.map((call) => String(call.toolName));
  const last = names[names.length - 1];
  return `Successful ${steps.length}-step run. Tool sequence: ${names.join(' -> ')}${last ? `; last tool call: ${last}.` : '.'}`;
}

function serializeChildRun(child: ChildRun): Record<string, unknown> {
  const totals = totalsForSteps(child.steps);
  return {
    run: child.run,
    totals,
    steps: child.steps.map((step) => stepSummary(step, child.steps)),
    childRuns: child.childRuns.map((grandchild) =>
      serializeChildRun(grandchild),
    ),
  };
}

export function availableToolsFromStep(step: Step): ToolDefinition[] {
  const input = inputForStep(step);
  return input?.tools ?? [];
}

export function allToolDataForStep(
  step: Step,
  siblingSteps: Step[],
): {
  available: ToolDefinition[];
  calls: ToolCallRow[];
  results: Array<
    ToolResultContentPart & {
      sourceStepId: string;
      sourceStepNumber: number;
      originalCallStepId?: string;
      originalCallStepNumber?: number;
      replayedFromStepId?: string;
      replayedFromStepNumber?: number;
      observedInStepId?: string;
      observedInStepNumber?: number;
      relationship: 'paired-next-step' | 'replayed-context';
    }
  >;
} {
  const output = outputForStepValue(step);
  const outputCalls = getOutputParts(output).toolCalls;
  const followingResults = toolResultsFromNextStep(step, siblingSteps);
  const resultIds = new Set(
    followingResults.flatMap((result) =>
      typeof result.toolCallId === 'string' ? [result.toolCallId] : [],
    ),
  );
  const calls: ToolCallRow[] = outputCalls.map((call) => ({
    ...call,
    stepId: step.id,
    stepNumber: step.step_number,
    relationship:
      call.toolCallId && resultIds.has(call.toolCallId)
        ? ('paired-next-step' as const)
        : ('terminal-unpaired-call' as const),
  }));
  const rawCalls = toolCallsFromEvents(step, toolCallIdSet(calls), resultIds);
  calls.push(...rawCalls);
  const reconstructedCalls = terminalToolInputCallsFromEvents(
    step,
    toolCallIdSet(calls),
  );
  calls.push(...reconstructedCalls);
  const callIds = new Set(calls.map((call) => call.toolCallId).filter(Boolean));
  const followingStep = nextStep(step, siblingSteps);
  const results = followingResults.map((result) => ({
    ...result,
    sourceStepId: step.id,
    sourceStepNumber: step.step_number,
    originalCallStepId: callIds.has(result.toolCallId) ? step.id : undefined,
    originalCallStepNumber: callIds.has(result.toolCallId)
      ? step.step_number
      : findOriginalCallStepNumber(result, siblingSteps),
    replayedFromStepId: callIds.has(result.toolCallId) ? undefined : step.id,
    replayedFromStepNumber: callIds.has(result.toolCallId)
      ? undefined
      : step.step_number,
    observedInStepId: followingStep?.id,
    observedInStepNumber: followingStep?.step_number,
    relationship:
      result.toolCallId && callIds.has(result.toolCallId)
        ? ('paired-next-step' as const)
        : ('replayed-context' as const),
  }));
  return { available: availableToolsFromStep(step), calls, results };
}

type ToolCallRow = ToolCallContentPart & {
  stepId: string;
  stepNumber: number;
  relationship:
    | 'paired-next-step'
    | 'terminal-unpaired-call'
    | 'reconstructed-terminal-tool-input';
};

function toolCallIdSet(calls: ToolCallRow[]): Set<string> {
  return new Set(
    calls.flatMap((call) =>
      typeof call.toolCallId === 'string' ? [call.toolCallId] : [],
    ),
  );
}

function toolCallsFromEvents(
  step: Step,
  knownToolCallIds: Set<string>,
  resultIds: Set<string>,
): Array<
  ToolCallContentPart & {
    stepId: string;
    stepNumber: number;
    relationship: 'paired-next-step' | 'terminal-unpaired-call';
  }
> {
  return rawEventsForStep(step)
    .filter((event) => event.type === 'tool-call')
    .filter((event) => {
      const toolCallId =
        typeof event.toolCallId === 'string' ? event.toolCallId : undefined;
      return toolCallId != null && !knownToolCallIds.has(toolCallId);
    })
    .flatMap((event) => {
      const toolName =
        typeof event.toolName === 'string' ? event.toolName : undefined;
      const toolCallId =
        typeof event.toolCallId === 'string' ? event.toolCallId : undefined;
      if (!toolName || !toolCallId) return [];
      return [
        {
          ...(event as unknown as ToolCallContentPart),
          toolName,
          toolCallId,
          stepId: step.id,
          stepNumber: step.step_number,
          relationship: resultIds.has(toolCallId)
            ? ('paired-next-step' as const)
            : ('terminal-unpaired-call' as const),
        },
      ];
    });
}

function terminalToolInputCallsFromEvents(
  step: Step,
  knownToolCallIds: Set<string>,
): Array<
  ToolCallContentPart & {
    stepId: string;
    stepNumber: number;
    relationship: 'reconstructed-terminal-tool-input';
  }
> {
  const events = rawEventsForStep(step);
  if (!events.some(isToolCallsFinishEvent)) return [];

  const pending = new Map<string, { toolName: string; deltas: string[] }>();
  for (const event of events) {
    if (event.type === 'tool-input-start') {
      const id = typeof event.id === 'string' ? event.id : undefined;
      const toolName =
        typeof event.toolName === 'string' ? event.toolName : undefined;
      if (id && toolName && !knownToolCallIds.has(id)) {
        pending.set(id, { toolName, deltas: [] });
      }
      continue;
    }
    if (event.type === 'tool-input-delta') {
      const id = typeof event.id === 'string' ? event.id : undefined;
      const delta = typeof event.delta === 'string' ? event.delta : undefined;
      if (id && delta) pending.get(id)?.deltas.push(delta);
    }
  }

  return [...pending.entries()].map(([toolCallId, call]) => ({
    type: 'tool-call' as const,
    toolName: call.toolName,
    toolCallId,
    input: call.deltas.join(''),
    stepId: step.id,
    stepNumber: step.step_number,
    relationship: 'reconstructed-terminal-tool-input' as const,
  }));
}

function rawEventsForStep(step: Step): Array<Record<string, unknown>> {
  const parsed = rawFieldForStep(step, 'raw_response');
  const events = Array.isArray(parsed)
    ? parsed
    : parsed == null
      ? []
      : [parsed];
  return events.filter(
    (event): event is Record<string, unknown> =>
      typeof event === 'object' && event != null,
  );
}

function isToolCallsFinishEvent(event: Record<string, unknown>): boolean {
  if (event.type !== 'finish') return false;
  const finishReason = event.finishReason;
  if (finishReason === 'tool-calls') return true;
  return (
    typeof finishReason === 'object' &&
    finishReason != null &&
    (finishReason as Record<string, unknown>).unified === 'tool-calls'
  );
}

function findOriginalCallStepNumber(
  result: ToolResultContentPart,
  siblingSteps: Step[],
): number | undefined {
  if (!result.toolCallId) return undefined;
  return siblingSteps.find((candidate) => {
    const output = outputForStepValue(candidate);
    return getOutputParts(output).toolCalls.some(
      (call) => call.toolCallId === result.toolCallId,
    );
  })?.step_number;
}

export function getMessagesForRun(
  db: Database,
  runId: string,
  options: {
    limit?: number;
    role?: string;
    parts?: string;
    maxChars?: number;
    withUsage?: boolean;
    includeSystem?: boolean;
  } = {},
): Array<Record<string, unknown>> {
  const steps = stepsForRun(db, runId);
  const messages: Array<Record<string, unknown>> = reconstructTranscript(
    steps,
  ).map(({ message, index, firstSeenStep, observedStep }) => {
    const usage = usageForStep(observedStep);
    return {
      stepId: observedStep.id,
      stepNumber: observedStep.step_number,
      firstSeenStepId: firstSeenStep.id,
      firstSeenStepNumber: firstSeenStep.step_number,
      index,
      ...normalizeMessage(message, options.maxChars ?? DEFAULT_MAX_CHARS),
      ...(options.withUsage
        ? {
            stepUsage: {
              input: usage.input,
              output: usage.output,
              cacheHitRatio: cacheHitRatio(usage.input),
            },
          }
        : {}),
    };
  });
  const filtered = messages.filter((message) => {
    if (!options.includeSystem && message.role === 'system') return false;
    if (options.role && message.role !== options.role) return false;
    if (!options.parts) return true;
    const wanted = new Set(options.parts.split(',').map((part) => part.trim()));
    return (
      (wanted.has('text') && Boolean(message.text)) ||
      (wanted.has('reasoning') && Boolean(message.reasoning)) ||
      (wanted.has('tool-calls') && Number(message.toolCallCount) > 0) ||
      (wanted.has('tool-results') && Number(message.toolResultCount) > 0) ||
      (wanted.has('attachments') && Number(message.attachmentCount) > 0) ||
      (wanted.has('unknown') && Number(message.unsupportedPartCount) > 0)
    );
  });
  return typeof options.limit === 'number'
    ? filtered.slice(-options.limit)
    : filtered;
}

function reconstructTranscript(steps: Step[]): Array<{
  message: PromptMessage;
  index: number;
  firstSeenStep: Step;
  observedStep: Step;
}> {
  const ordered: Array<{
    key: string;
    message: PromptMessage;
    index: number;
    firstSeenStep: Step;
    observedStep: Step;
  }> = [];
  const firstSeenByKey = new Map<string, Step>();

  for (const step of steps) {
    const prompt = inputForStep(step)?.prompt ?? [];
    const occurrences = new Map<string, number>();
    for (const [index, message] of prompt.entries()) {
      const fingerprint = JSON.stringify({
        role: message.role,
        content: message.content,
      });
      const occurrence = occurrences.get(fingerprint) ?? 0;
      occurrences.set(fingerprint, occurrence + 1);
      const key = `${fingerprint}#${occurrence}`;
      const firstSeenStep = firstSeenByKey.get(key) ?? step;
      firstSeenByKey.set(key, firstSeenStep);
      const existingIndex = ordered.findIndex((entry) => entry.key === key);
      if (existingIndex >= 0) ordered.splice(existingIndex, 1);
      ordered.push({
        key,
        message,
        index,
        firstSeenStep,
        observedStep: step,
      });
    }
  }

  return ordered;
}

function normalizeMessage(
  message: PromptMessage,
  maxChars: number,
): Record<string, unknown> {
  const toolCalls = toolCallsFromContent(message.content);
  const toolResults = toolResultsFromContent(message.content);
  const text = textFromContent(message.content);
  const reasoning = reasoningFromContent(message.content);
  const otherParts = Array.isArray(message.content)
    ? message.content.filter(
        (part) =>
          part.type !== 'text' &&
          part.type !== 'thinking' &&
          part.type !== 'reasoning' &&
          part.type !== 'tool-call' &&
          part.type !== 'tool-result',
      )
    : [];
  const attachmentCount = otherParts.filter(
    (part) =>
      part.type === 'image' ||
      part.type === 'file' ||
      part.type === 'reasoning-file',
  ).length;
  const unsupportedPartCount = otherParts.filter(
    (part) => 'unsupported' in part && part.unsupported === true,
  ).length;
  return {
    role: message.role,
    partCount: Array.isArray(message.content)
      ? message.content.length
      : message.content
        ? 1
        : 0,
    text: preview(text, maxChars),
    reasoning: preview(reasoning, maxChars),
    toolCallCount: toolCalls.length,
    toolResultCount: toolResults.length,
    attachmentCount,
    unsupportedPartCount,
    otherParts: otherParts.map((part) => ({
      type: part.type ?? 'unknown',
      mediaType: 'mediaType' in part ? part.mediaType : undefined,
      filename: 'filename' in part ? part.filename : undefined,
      kind: 'kind' in part ? part.kind : undefined,
      approvalId: 'approvalId' in part ? part.approvalId : undefined,
      unsupported: 'unsupported' in part ? part.unsupported : false,
    })),
    toolCalls: toolCalls.map((call) => ({
      toolName: call.toolName,
      toolCallId: call.toolCallId,
      args: preview(safeParseValue(call.args ?? call.input), maxChars),
    })),
    toolResults: toolResults.map((result) => ({
      toolName: result.toolName,
      toolCallId: result.toolCallId,
      result: preview(safeParseValue(result.result ?? result.output), maxChars),
    })),
  };
}

export function outputForStep(
  step: Step,
  siblingSteps: Step[],
  options: {
    maxChars?: number;
    full?: boolean;
    text?: boolean;
    reasoning?: boolean;
    tools?: boolean;
  } = {},
): Record<string, unknown> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const output = outputForStepValue(step);
  if (!output) return { stepId: step.id, output: null, error: step.error };
  const parts = getOutputParts(output);
  const results = toolResultsFromNextStep(step, siblingSteps);
  const includeAll = !options.text && !options.reasoning && !options.tools;
  return {
    stepId: step.id,
    finishReason: output.finishReason,
    ...(includeAll || options.text
      ? {
          text: options.full ? parts.text : preview(parts.text, maxChars),
          objectText: options.full
            ? output.objectText
            : preview(output.objectText, maxChars),
        }
      : {}),
    ...(includeAll || options.reasoning
      ? {
          reasoning: options.full
            ? parts.reasoning
            : preview(parts.reasoning, maxChars),
        }
      : {}),
    ...(includeAll || options.tools
      ? {
          toolCalls: parts.toolCalls.map((call) => ({
            toolName: call.toolName,
            toolCallId: call.toolCallId,
            args: options.full
              ? safeParseValue(call.args ?? call.input)
              : preview(safeParseValue(call.args ?? call.input), maxChars),
            result: call.toolCallId
              ? options.full
                ? safeParseValue(
                    results.find(
                      (result) => result.toolCallId === call.toolCallId,
                    )?.result ??
                      results.find(
                        (result) => result.toolCallId === call.toolCallId,
                      )?.output,
                  )
                : preview(
                    safeParseValue(
                      results.find(
                        (result) => result.toolCallId === call.toolCallId,
                      )?.result ??
                        results.find(
                          (result) => result.toolCallId === call.toolCallId,
                        )?.output,
                    ),
                    maxChars,
                  )
              : undefined,
          })),
        }
      : {}),
  };
}

export function usageForTarget(
  db: Database,
  targetId: string,
): Record<string, unknown> {
  const step = findStep(db, targetId);
  if (step)
    return { targetType: 'step', stepId: step.id, usage: usageForStep(step) };
  const run = findRun(db, targetId);
  if (!run) throw new Error(`Run or step not found: ${targetId}`);
  const steps = stepsForRun(db, run.id);
  const totals = totalsForSteps(steps);
  return {
    targetType: 'run',
    runId: run.id,
    stepCount: steps.length,
    usage: { input: totals.input, output: totals.output },
    steps: steps.map((stepItem) => ({
      stepId: stepItem.id,
      stepNumber: stepItem.step_number,
      usage: usageForStep(stepItem),
    })),
  };
}

export function toolsForTarget(
  db: Database,
  targetId: string,
  options: {
    toolCallId?: string;
    includeAvailable?: boolean;
    availableOnly?: boolean;
  } = {},
): Record<string, unknown> {
  const step = findStep(db, targetId);
  const steps = step ? [step] : stepsForRun(db, targetId);
  if (steps.length === 0) throw new Error(`Run or step not found: ${targetId}`);
  const rows = steps.map((stepItem) =>
    allToolDataForStep(
      stepItem,
      step ? stepsForRun(db, stepItem.run_id) : steps,
    ),
  );
  const available = dedupeTools(rows.flatMap((row) => row.available));
  const calls = rows.flatMap((row) => row.calls);
  const results = rows.flatMap((row) => row.results);
  const filteredCalls = options.toolCallId
    ? calls.filter((call) => call.toolCallId === options.toolCallId)
    : calls;
  const filteredResults = options.toolCallId
    ? results.filter((result) => result.toolCallId === options.toolCallId)
    : results;
  const pairedResults = filteredResults.filter(
    (result) => result.relationship === 'paired-next-step',
  );
  const replayedResults = filteredResults.filter(
    (result) => result.relationship === 'replayed-context',
  );
  const unpairedTerminalCalls = filteredCalls.filter(
    (call) =>
      call.relationship === 'terminal-unpaired-call' ||
      call.relationship === 'reconstructed-terminal-tool-input',
  );
  const counts = filteredCalls.reduce<Record<string, number>>((acc, call) => {
    acc[call.toolName] = (acc[call.toolName] ?? 0) + 1;
    return acc;
  }, {});
  return {
    targetType: step ? 'step' : 'run',
    targetId,
    calls: options.availableOnly ? [] : filteredCalls,
    results: options.availableOnly ? [] : filteredResults,
    ...(options.includeAvailable || options.availableOnly ? { available } : {}),
    summary: {
      availableToolCount: available.length,
      toolCallCount: options.availableOnly ? 0 : filteredCalls.length,
      toolResultCount: options.availableOnly ? 0 : filteredResults.length,
      pairedToolResultCount: options.availableOnly ? 0 : pairedResults.length,
      replayedToolResultCount: options.availableOnly
        ? 0
        : replayedResults.length,
      unpairedTerminalToolCallCount: options.availableOnly
        ? 0
        : unpairedTerminalCalls.length,
      counts,
    },
  };
}

export function eventsForStep(
  step: Step,
  options: {
    source?: 'response' | 'chunks';
    limit?: number;
    type?: string;
    maxChars?: number;
  } = {},
): Record<string, unknown> {
  const source = options.source ?? 'response';
  const parsed = rawFieldForStep(
    step,
    source === 'chunks' ? 'raw_chunks' : 'raw_response',
  );
  const events = Array.isArray(parsed)
    ? parsed
    : parsed == null
      ? []
      : [parsed];
  const filtered =
    typeof options.type === 'string'
      ? events.filter(
          (event) =>
            typeof event === 'object' &&
            event != null &&
            String((event as Record<string, unknown>).type) === options.type,
        )
      : events;
  const selected =
    typeof options.limit === 'number'
      ? filtered.slice(-options.limit)
      : filtered;
  const typeCounts = events.reduce<Record<string, number>>((acc, event) => {
    const type =
      typeof event === 'object' && event != null
        ? String((event as Record<string, unknown>).type ?? 'unknown')
        : 'unknown';
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});
  const diagnosis = diagnoseEvents(events);
  return {
    stepId: step.id,
    source,
    totalEventCount: events.length,
    filteredEventCount: filtered.length,
    typeCounts,
    diagnosis,
    events: selected.map((event, index) => ({
      index:
        typeof options.limit === 'number'
          ? filtered.length - selected.length + index
          : index,
      value: preview(event, options.maxChars ?? DEFAULT_MAX_CHARS),
    })),
  };
}

function diagnoseEvents(events: unknown[]): Record<string, unknown> {
  const typedEvents = events.filter(
    (event): event is Record<string, unknown> =>
      typeof event === 'object' && event != null,
  );
  const types = typedEvents.map((event) => String(event.type ?? 'unknown'));
  const toolInputStart = typedEvents.find(
    (event) => event.type === 'tool-input-start',
  );
  const toolInputStarted =
    toolInputStart == null
      ? null
      : {
          id: toolInputStart.id ?? null,
          toolName: toolInputStart.toolName ?? null,
        };
  const terminalEventSeen = types.some((type) =>
    [
      'finish',
      'response.done',
      'response.completed',
      'response.error',
      'error',
      'tool-call',
      'tool-call-delta',
      'tool-input-available',
    ].includes(type),
  );
  const toolInputCompleted = types.some((type) =>
    ['tool-input-available', 'tool-call', 'tool-call-delta'].includes(type),
  );
  const toolInputPartial = typedEvents
    .filter(
      (event) =>
        event.type === 'tool-input-delta' && typeof event.delta === 'string',
    )
    .map((event) => String(event.delta))
    .join('');
  const likelyFailure =
    toolInputStarted && !toolInputCompleted
      ? `aborted during streamed tool input${typeof toolInputStarted.toolName === 'string' ? ` for ${toolInputStarted.toolName}` : ''}`
      : !terminalEventSeen && events.length > 0
        ? 'stream ended without a terminal event'
        : null;
  return {
    streamStarted:
      types.includes('stream-start') || types.includes('response.created'),
    responseMetadataSeen: types.includes('response-metadata'),
    toolInputStarted,
    toolInputPartial: toolInputPartial || null,
    toolInputCompleted,
    terminalEventSeen,
    likelyFailure,
  };
}

function dedupeTools(tools: ToolDefinition[]): ToolDefinition[] {
  const seen = new Set<string>();
  const deduped: ToolDefinition[] = [];
  for (const tool of tools) {
    const key = `${tool.name}:${JSON.stringify((tool as unknown as Record<string, unknown>).id ?? '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(tool);
  }
  return deduped;
}

export function rawForStep(
  step: Step,
  options: {
    request?: boolean;
    response?: boolean;
    chunks?: boolean;
    provider?: boolean;
    aiSdk?: boolean;
    jsonPath?: string;
    maxChars?: number;
    full?: boolean;
  } = {},
): Record<string, unknown> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const selected: Record<string, string | null> = {};
  const explicit =
    options.request ||
    options.response ||
    options.chunks ||
    options.provider ||
    options.aiSdk;
  if (!explicit || options.request) selected.raw_request = step.raw_request;
  if (!explicit || options.response || options.aiSdk)
    selected.raw_response = step.raw_response;
  if (!explicit || options.chunks || options.provider)
    selected.raw_chunks = step.raw_chunks;
  const fields = Object.fromEntries(
    Object.entries(selected).map(([key, value]) => {
      const parsed = parseJson(value);
      const target = options.jsonPath
        ? getByPath(parsed, options.jsonPath)
        : parsed;
      return [
        key,
        options.full
          ? target
          : {
              ...fieldMeta(value),
              value: preview(target, maxChars),
            },
      ];
    }),
  );
  return { stepId: step.id, fields };
}

export function getByPath(value: unknown, pathExpression: string): unknown {
  const cleaned = pathExpression.replace(/^\$\.?/, '');
  if (!cleaned) return value;
  const parts = cleaned.match(/[^.[\]]+|\[(\d+)\]/g) ?? [];
  let current = value;
  for (const rawPart of parts) {
    const part = rawPart.startsWith('[') ? rawPart.slice(1, -1) : rawPart;
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      current = current[Number(part)];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function buildTraceSpans(runDetail: RunDetail): TraceSpan[] {
  const spans: TraceSpan[] = [];
  const traceStart = new Date(runDetail.run.started_at).getTime();

  const addStepSpans = (
    steps: Step[],
    depth: number,
    childRuns: ChildRun[],
    functionId?: string | null,
  ) => {
    for (const step of steps) {
      const stepStartMs = new Date(step.started_at).getTime() - traceStart;
      const durationMs = step.duration_ms ?? 0;
      const usage = usageForStep(step);
      const output = outputForStepValue(step);
      const parts = getOutputParts(output);
      const label = functionId || step.model_id || 'LLM call';
      spans.push({
        id: step.id,
        stepId: step.id,
        label,
        sublabel: functionId ? step.model_id : undefined,
        startMs: stepStartMs,
        durationMs,
        depth,
        kind: 'step',
        tokens: { input: usage.input.total, output: usage.output.total },
        modelId: step.model_id,
        isInProgress: step.duration_ms === null && !step.error,
      });

      let cursor = stepStartMs;
      const stepEnd = stepStartMs + durationMs;
      if (parts.reasoning) {
        spans.push({
          id: `${step.id}-thinking`,
          stepId: step.id,
          label: 'Thinking',
          sublabel: truncateText(parts.reasoning, 60),
          startMs: cursor,
          durationMs: Math.max(0, Math.floor(durationMs * 0.25)),
          depth: depth + 1,
          kind: 'thinking',
          thinkingText: parts.reasoning,
        });
        cursor += Math.max(0, Math.floor(durationMs * 0.25));
      }

      for (const call of parts.toolCalls) {
        spans.push({
          id: `${step.id}-tool-${call.toolCallId ?? spans.length}`,
          stepId: step.id,
          label: call.toolName,
          sublabel:
            typeof (call.input ?? call.args) === 'string'
              ? truncateText(String(call.input ?? call.args), 60)
              : undefined,
          startMs: cursor,
          durationMs: 0,
          depth: depth + 1,
          kind: 'tool-call',
          toolCallId: call.toolCallId,
        });
      }

      if (parts.text) {
        spans.push({
          id: `${step.id}-text`,
          stepId: step.id,
          label: 'Text',
          sublabel: truncateText(parts.text, 60),
          startMs: cursor,
          durationMs: Math.max(0, stepEnd - cursor),
          depth: depth + 1,
          kind: 'text',
          textContent: parts.text,
        });
      }

      if (step.error) {
        spans.push({
          id: `${step.id}-error`,
          stepId: step.id,
          label: 'Error',
          sublabel: truncateText(step.error, 60),
          startMs: cursor,
          durationMs: Math.max(0, stepEnd - cursor),
          depth: depth + 1,
          kind: 'error',
        });
      }

      for (const child of childRuns.filter(
        (childRun) => childRun.run.parent_step_id === step.id,
      )) {
        addStepSpans(
          child.steps,
          depth + 1,
          child.childRuns,
          child.run.function_id,
        );
      }
    }
  };

  addStepSpans(
    runDetail.steps,
    0,
    runDetail.childRuns,
    runDetail.run.function_id,
  );
  return spans;
}
