import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Database } from '../src/types.js';
import {
  buildTraceSpans,
  eventsForStep,
  getMessagesForRun,
  inspectRun,
  outputForStep,
  rawForStep,
  runDetailSummary,
  stepSummary,
  readDatabase,
  stepsForRun,
  summarizeRun,
  toolsForTarget,
  usageForTarget,
} from '../src/generations.js';

const db: Database = {
  runs: [
    {
      id: 'run-root',
      started_at: '2026-01-01T00:00:00.000Z',
      parent_run_id: null,
      parent_step_id: null,
      function_id: 'chat-handler',
    },
    {
      id: 'run-child',
      started_at: '2026-01-01T00:00:01.000Z',
      parent_run_id: 'run-root',
      parent_step_id: 'step-tool-call',
      function_id: 'search-helper',
    },
  ],
  steps: [
    {
      id: 'step-tool-call',
      run_id: 'run-root',
      step_number: 1,
      type: 'stream',
      model_id: 'test-model',
      provider: 'test.provider',
      started_at: '2026-01-01T00:00:00.100Z',
      duration_ms: 1200,
      input: JSON.stringify({
        prompt: [
          {
            role: 'system',
            content: 'System guidance that should be queryable.',
          },
          { role: 'user', content: 'Find the current status.' },
        ],
        tools: [
          {
            name: 'lookupStatus',
            description: 'Look up status.',
            parameters: {
              type: 'object',
              properties: { id: { type: 'string' } },
            },
          },
        ],
        toolChoice: { type: 'auto' },
        temperature: 0.2,
        maxOutputTokens: 400,
      }),
      output: JSON.stringify({
        finishReason: 'tool-calls',
        reasoningParts: [{ type: 'reasoning', text: 'Need a lookup.' }],
        toolCalls: [
          {
            type: 'tool-call',
            toolName: 'lookupStatus',
            toolCallId: 'tc-1',
            input: { id: 'abc' },
          },
        ],
        usage: { inputTokens: 10, outputTokens: 4 },
      }),
      usage: JSON.stringify({
        inputTokens: { total: 10, noCache: 2, cacheRead: 3, cacheWrite: 5 },
        outputTokens: { total: 4, text: 0, reasoning: 4 },
        raw: { providerTokens: 14 },
      }),
      error: null,
      raw_request: JSON.stringify({
        model: 'test-model',
        input: [{ role: 'user', content: 'Find the current status.' }],
      }),
      raw_response: JSON.stringify([
        { type: 'tool-call', toolName: 'lookupStatus' },
      ]),
      raw_chunks: JSON.stringify([
        { provider: 'chunk', payload: { id: 'tc-1' } },
      ]),
      provider_options: JSON.stringify({ test: { mode: 'fast' } }),
    },
    {
      id: 'step-tool-result',
      run_id: 'run-root',
      step_number: 2,
      type: 'generate',
      model_id: 'test-model',
      provider: 'test.provider',
      started_at: '2026-01-01T00:00:02.000Z',
      duration_ms: 500,
      input: JSON.stringify({
        prompt: [
          { role: 'user', content: 'Find the current status.' },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolName: 'lookupStatus',
                toolCallId: 'tc-1',
                output: { status: 'ready' },
              },
            ],
          },
        ],
      }),
      output: JSON.stringify({
        finishReason: 'stop',
        content: [{ type: 'text', text: 'The status is ready.' }],
        response: { id: 'response-1' },
      }),
      usage: JSON.stringify({ inputTokens: 7, outputTokens: 5 }),
      error: null,
      raw_request: JSON.stringify({ request: true }),
      raw_response: JSON.stringify({ response: true }),
      raw_chunks: null,
      provider_options: null,
    },
    {
      id: 'step-child',
      run_id: 'run-child',
      step_number: 1,
      type: 'generate',
      model_id: 'child-model',
      provider: 'child.provider',
      started_at: '2026-01-01T00:00:01.100Z',
      duration_ms: null,
      input: JSON.stringify({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Nested request' }] },
        ],
      }),
      output: JSON.stringify({
        finishReason: 'stop',
        objectText: '{"ok":true}',
        content: [{ type: 'text', text: 'Nested answer' }],
      }),
      usage: null,
      error: null,
      raw_request: null,
      raw_response: null,
      raw_chunks: null,
      provider_options: null,
    },
    {
      id: 'step-error',
      run_id: 'run-root',
      step_number: 3,
      type: 'generate',
      model_id: 'test-model',
      provider: 'test.provider',
      started_at: '2026-01-01T00:00:03.000Z',
      duration_ms: 100,
      input: JSON.stringify({
        prompt: [{ role: 'user', content: 'Fail now' }],
      }),
      output: null,
      usage: null,
      error: 'Synthetic failure',
      raw_request: null,
      raw_response: null,
      raw_chunks: null,
      provider_options: null,
    },
  ],
};

describe('generations queries', () => {
  it('summarizes runs with viewer-style metadata and token totals', () => {
    const summary = summarizeRun(db, db.runs[0]!, true);

    expect(summary).toMatchObject({
      id: 'run-root',
      functionId: 'chat-handler',
      firstMessage: 'Find the current status.',
      stepCount: 3,
      childRunCount: 1,
      hasError: true,
      isInProgress: false,
    });
    expect(summary.tokens).toMatchObject({
      input: { total: 17, noCache: 2, cacheRead: 3, cacheWrite: 5 },
      output: { total: 9, text: 0, reasoning: 4 },
    });
  });

  it('builds run detail with child runs and timeline spans', () => {
    const detail = runDetailSummary(db, 'run-root', {
      includeChildren: true,
      timeline: true,
    });

    expect(detail.childRuns).toHaveLength(1);
    expect(detail.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'step', stepId: 'step-tool-call' }),
        expect.objectContaining({ kind: 'thinking', stepId: 'step-tool-call' }),
        expect.objectContaining({ kind: 'tool-call', toolCallId: 'tc-1' }),
        expect.objectContaining({ kind: 'text', stepId: 'step-tool-result' }),
        expect.objectContaining({ kind: 'error', stepId: 'step-error' }),
      ]),
    );
  });

  it('summarizes steps including tool call and raw field metadata', () => {
    const steps = stepsForRun(db, 'run-root');
    const summary = stepSummary(steps[0]!, steps);

    expect(summary.outputSummary).toMatchObject({
      type: 'tool-calls',
      label: 'lookupStatus',
      counts: { lookupStatus: 1 },
    });
    expect(summary.availableToolCount).toBe(1);
    expect(summary.raw).toMatchObject({
      request: { present: true },
      response: { present: true },
      chunks: { present: true },
      providerOptions: { present: true },
    });
  });

  it('extracts bounded messages by role and part type', () => {
    expect(getMessagesForRun(db, 'run-root', { role: 'tool' })).toEqual([
      expect.objectContaining({
        role: 'tool',
        toolResultCount: 1,
      }),
    ]);

    expect(
      getMessagesForRun(db, 'run-root', { parts: 'tool-results' }),
    ).toEqual([expect.objectContaining({ role: 'tool' })]);

    expect(
      getMessagesForRun(db, 'run-root', { limit: 1, withUsage: true }),
    ).toEqual([
      expect.objectContaining({
        role: 'user',
        stepUsage: {
          input: { total: 0 },
          output: { total: 0 },
          cacheHitRatio: null,
        },
      }),
    ]);
  });

  it('pairs output tool calls with next-step tool results', () => {
    const step = db.steps[0]!;
    const output = outputForStep(step, stepsForRun(db, 'run-root'), {
      tools: true,
    });

    expect(output.toolCalls).toEqual([
      expect.objectContaining({
        toolName: 'lookupStatus',
        toolCallId: 'tc-1',
        result: { status: 'ready' },
      }),
    ]);
  });

  it('queries tools and usage for either a run or step', () => {
    expect(
      toolsForTarget(db, 'run-root', { toolCallId: 'tc-1' }),
    ).toMatchObject({
      summary: { availableToolCount: 1, toolCallCount: 1, toolResultCount: 1 },
      calls: [expect.objectContaining({ toolName: 'lookupStatus' })],
      results: [expect.objectContaining({ toolCallId: 'tc-1' })],
    });
    expect(toolsForTarget(db, 'run-root')).not.toHaveProperty('available');
    expect(
      toolsForTarget(db, 'run-root', { availableOnly: true }),
    ).toMatchObject({
      available: [expect.objectContaining({ name: 'lookupStatus' })],
      calls: [],
      results: [],
    });

    expect(usageForTarget(db, 'step-tool-call')).toMatchObject({
      targetType: 'step',
      usage: {
        input: { total: 10, noCache: 2, cacheRead: 3, cacheWrite: 5 },
        output: { total: 4, text: 0, reasoning: 4 },
        raw: { providerTokens: 14 },
      },
    });
  });

  it('queries raw fields by path without forcing full output', () => {
    const raw = rawForStep(db.steps[0]!, {
      provider: true,
      jsonPath: '$[0].payload.id',
    });

    expect(raw).toMatchObject({
      fields: {
        raw_chunks: {
          value: 'tc-1',
        },
      },
    });
  });

  it('builds an LLM-oriented run inspection view', () => {
    const inspection = inspectRun(db, 'run-root', {
      recentMessages: 3,
      maxChars: 80,
      includeEvents: true,
    });

    expect(inspection).toMatchObject({
      run: {
        id: 'run-root',
        status: 'error',
        error: 'Synthetic failure',
        stepCount: 3,
      },
      usage: {
        input: { total: 17, noCache: 2, cacheRead: 3, cacheWrite: 5 },
        output: { total: 9, text: 0, reasoning: 4 },
      },
      diagnostics: {
        failureStepId: 'step-error',
        failureStepNumber: 3,
      },
    });
    expect(inspection.recentMessages).toHaveLength(3);
    expect(inspection.tools).toMatchObject({
      calls: [expect.objectContaining({ toolName: 'lookupStatus' })],
      summary: { availableToolCount: 1 },
    });
  });

  it('summarizes raw stream events without full raw output', () => {
    const events = eventsForStep(db.steps[0]!, {
      source: 'chunks',
      limit: 1,
      maxChars: 60,
    });

    expect(events).toMatchObject({
      stepId: 'step-tool-call',
      source: 'chunks',
      totalEventCount: 1,
      typeCounts: { unknown: 1 },
      events: [
        expect.objectContaining({
          index: 0,
        }),
      ],
    });
  });

  it('creates timeline spans for nested child runs', () => {
    const detail = getDetail();
    const spans = buildTraceSpans(detail);

    expect(spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stepId: 'step-child',
          label: 'search-helper',
          isInProgress: true,
        }),
      ]),
    );
  });

  it('validates generations database shape when reading from disk', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aisdk-dt-'));
    const badFile = path.join(tmpDir, 'generations.json');
    fs.writeFileSync(
      badFile,
      JSON.stringify({ runs: [{}], steps: [] }),
      'utf8',
    );

    expect(() => readDatabase(badFile)).toThrow('Invalid generations database');
  });

  it('ignores malformed output tool-call/message structures safely', () => {
    const malformedStep = {
      ...db.steps[0]!,
      output: JSON.stringify({
        finishReason: 'tool-calls',
        toolCalls: [{ type: 'tool-call', toolCallId: 'broken' }],
      }),
    };

    const summary = stepSummary(malformedStep, [malformedStep]);

    expect(summary).toMatchObject({
      outputSummary: { type: 'response', label: 'Response' },
      output: { toolCallCount: 0 },
    });
  });
});

function getDetail() {
  return {
    run: { ...db.runs[0]!, isInProgress: false },
    steps: stepsForRun(db, 'run-root'),
    childRuns: [
      {
        run: { ...db.runs[1]!, isInProgress: true },
        steps: stepsForRun(db, 'run-child'),
        childRuns: [],
      },
    ],
  };
}
