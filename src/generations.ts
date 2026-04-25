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

export function resolveDbPath(file?: string): string {
  return path.resolve(
    file ?? path.join(process.cwd(), '.devtools/generations.json'),
  );
}

export function readDatabase(file?: string): Database {
  const dbPath = resolveDbPath(file);
  const content = fs.readFileSync(dbPath, 'utf8');
  const parsed = JSON.parse(content) as unknown;
  const result = databaseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid generations database: ${dbPath} (${result.error.issues[0]?.message ?? 'schema mismatch'})`,
    );
  }
  return { runs: result.data.runs, steps: result.data.steps };
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

export function fieldMeta(
  value: string | null | undefined,
  maxChars = 120,
): {
  present: boolean;
  chars: number;
  preview?: string;
} {
  if (!value) return { present: false, chars: 0 };
  return {
    present: true,
    chars: value.length,
    preview: value.slice(0, maxChars),
  };
}

export function isInProgress(steps: Step[]): boolean {
  return steps.some((step) => step.duration_ms === null && !step.error);
}

export function stepsForRun(db: Database, runId: string): Step[] {
  return db.steps
    .filter((step) => step.run_id === runId)
    .sort((a, b) => a.step_number - b.step_number);
}

export function findRun(db: Database, runId: string): Run | undefined {
  return db.runs.find((run) => run.id === runId);
}

export function findStep(db: Database, stepId: string): Step | undefined {
  return db.steps.find((step) => step.id === stepId);
}

export function buildChildRuns(db: Database, parentRunId: string): ChildRun[] {
  const children = db.runs
    .filter((run) => run.parent_run_id === parentRunId)
    .sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    );
  return children.map((run) => {
    const steps = stepsForRun(db, run.id);
    return {
      run: { ...run, isInProgress: isInProgress(steps) },
      steps,
      childRuns: buildChildRuns(db, run.id),
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
  const input = parseInput(firstStep.input);
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
  const usage = parseUsage(step.usage);
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

export function getOutputParts(output: ParsedOutput | null): {
  textParts: TextContentPart[];
  reasoningParts: ReasoningContentPart[];
  toolCalls: ToolCallContentPart[];
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
  return {
    textParts,
    reasoningParts,
    toolCalls,
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
  const input = nextStep ? parseInput(nextStep.input) : null;
  return (
    input?.prompt
      ?.filter((message) => message.role === 'tool')
      .flatMap((message) => toolResultsFromContent(message.content)) ?? []
  );
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
  const input = parseInput(step.input);
  const output = parseOutput(step.output);
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
  const childRuns = db.runs.filter((child) => child.parent_run_id === run.id);
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
    ...(options.timeline ? { timeline: buildTraceSpans(detail) } : {}),
  };
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
  const input = parseInput(step.input);
  return input?.tools ?? [];
}

export function allToolDataForStep(
  step: Step,
  siblingSteps: Step[],
): {
  available: ToolDefinition[];
  calls: Array<ToolCallContentPart & { stepId: string; stepNumber: number }>;
  results: Array<
    ToolResultContentPart & { sourceStepId: string; sourceStepNumber: number }
  >;
} {
  const output = parseOutput(step.output);
  const calls = getOutputParts(output).toolCalls.map((call) => ({
    ...call,
    stepId: step.id,
    stepNumber: step.step_number,
  }));
  const results = toolResultsFromNextStep(step, siblingSteps).map((result) => ({
    ...result,
    sourceStepId: step.id,
    sourceStepNumber: step.step_number,
  }));
  return { available: availableToolsFromStep(step), calls, results };
}

export function getMessagesForRun(
  db: Database,
  runId: string,
  options: {
    limit?: number;
    role?: string;
    parts?: string;
    maxChars?: number;
  } = {},
): Array<Record<string, unknown>> {
  const steps = stepsForRun(db, runId);
  const messages: Array<Record<string, unknown>> = steps.flatMap((step) => {
    const input = parseInput(step.input);
    return (input?.prompt ?? []).map((message, index) => ({
      stepId: step.id,
      stepNumber: step.step_number,
      index,
      ...normalizeMessage(message, options.maxChars ?? DEFAULT_MAX_CHARS),
    }));
  });
  const filtered = messages.filter((message) => {
    if (options.role && message.role !== options.role) return false;
    if (!options.parts) return true;
    const wanted = new Set(options.parts.split(',').map((part) => part.trim()));
    return (
      (wanted.has('text') && Boolean(message.text)) ||
      (wanted.has('reasoning') && Boolean(message.reasoning)) ||
      (wanted.has('tool-calls') && Number(message.toolCallCount) > 0) ||
      (wanted.has('tool-results') && Number(message.toolResultCount) > 0)
    );
  });
  return typeof options.limit === 'number'
    ? filtered.slice(-options.limit)
    : filtered;
}

function normalizeMessage(
  message: PromptMessage,
  maxChars: number,
): Record<string, unknown> {
  const toolCalls = toolCallsFromContent(message.content);
  const toolResults = toolResultsFromContent(message.content);
  const text = textFromContent(message.content);
  const reasoning = reasoningFromContent(message.content);
  return {
    role: message.role,
    partCount:
      (text ? 1 : 0) +
      (reasoning ? 1 : 0) +
      toolCalls.length +
      toolResults.length,
    text: preview(text, maxChars),
    reasoning: preview(reasoning, maxChars),
    toolCallCount: toolCalls.length,
    toolResultCount: toolResults.length,
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
  const output = parseOutput(step.output);
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
  options: { toolCallId?: string } = {},
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
  const counts = filteredCalls.reduce<Record<string, number>>((acc, call) => {
    acc[call.toolName] = (acc[call.toolName] ?? 0) + 1;
    return acc;
  }, {});
  return {
    targetType: step ? 'step' : 'run',
    targetId,
    available,
    calls: filteredCalls,
    results: filteredResults,
    summary: {
      availableToolCount: available.length,
      toolCallCount: filteredCalls.length,
      toolResultCount: filteredResults.length,
      counts,
    },
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
      const output = parseOutput(step.output);
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
