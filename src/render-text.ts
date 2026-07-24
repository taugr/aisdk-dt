export function renderText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
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
    if (obj.run && obj.usage) return renderInspectionText(obj);
    if (hasOwn(obj, 'finalOutput')) return renderFinalOutputText(obj);
    if (obj.targetType === 'run' && Array.isArray(obj.steps) && obj.usage)
      return renderUsageText(obj);
    if (obj.targetType === 'step' && obj.usage) return renderUsageText(obj);
    if (obj.runId && Array.isArray(obj.messages))
      return renderMessagesText(obj);
    if (obj.runId && Array.isArray(obj.spans)) return renderTimelineText(obj);
    if (obj.calls && obj.results && obj.summary) return renderToolsText(obj);
    if (obj.events && obj.typeCounts) return renderEventsText(obj);
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
      `finalOutput=${renderFinalOutput(narrative.finalOutput as Record<string, unknown> | null)}`,
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
