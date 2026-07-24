import { describe, expect, it } from 'vitest';
import {
  boundRenderedText,
  stringifyBoundedOutput,
} from '../src/output-policy.js';
import {
  inspectRun,
  runDetailSummary,
  traceSpanSummaries,
} from '../src/generations.js';
import type { Database } from '../src/types.js';

const hiddenCanary = 'SHOULD_NOT_APPEAR_AFTER_THE_BOUNDARY';
const longPrefix = 'x'.repeat(4_000);

const db: Database = {
  runs: [
    {
      id: 'run-safe',
      started_at: '2026-07-24T00:00:00.000Z',
      parent_run_id: null,
      parent_step_id: null,
      function_id: 'safety-test',
    },
  ],
  steps: [
    {
      id: 'step-safe',
      run_id: 'run-safe',
      step_number: 1,
      type: 'generate',
      model_id: 'test-model',
      provider: 'test',
      started_at: '2026-07-24T00:00:00.000Z',
      duration_ms: 10,
      input: JSON.stringify({
        prompt: [{ role: 'user', content: 'hello' }],
      }),
      output: JSON.stringify({
        finishReason: 'tool-calls',
        reasoningParts: [
          { type: 'reasoning', text: `${longPrefix}${hiddenCanary}` },
        ],
        toolCalls: [
          {
            type: 'tool-call',
            toolName: 'lookup',
            toolCallId: 'call-1',
            input: { payload: `${longPrefix}${hiddenCanary}` },
          },
        ],
      }),
      usage: null,
      error: null,
      raw_request: `${longPrefix}${hiddenCanary}`,
      raw_response: null,
      raw_chunks: null,
      provider_options: null,
    },
  ],
};

describe('bounded output policy', () => {
  it('enforces a hard JSON output bound', () => {
    const output = stringifyBoundedOutput(
      {
        values: Array.from({ length: 200 }, (_, index) => ({
          index,
          value: `${longPrefix}${hiddenCanary}`,
        })),
      },
      { maxOutputChars: 2_000 },
    );

    expect(output.length).toBeLessThanOrEqual(2_000);
    expect(output).not.toContain(hiddenCanary);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('limits arrays with explicit omitted-item metadata', () => {
    const parsed = JSON.parse(
      stringifyBoundedOutput(
        { values: Array.from({ length: 80 }, (_, index) => index) },
        { maxOutputChars: 4_000 },
      ),
    ) as { values: Array<unknown> };

    expect(parsed.values).toHaveLength(51);
    expect(parsed.values.at(-1)).toEqual({
      truncated: true,
      totalItems: 80,
      omittedItems: 30,
    });
  });

  it('stops deeply nested unknown data with valid metadata', () => {
    const value = { level: {} as Record<string, unknown> };
    let cursor = value.level;
    for (let depth = 0; depth < 20; depth += 1) {
      cursor.child = {};
      cursor = cursor.child as Record<string, unknown>;
    }
    const rendered = stringifyBoundedOutput(value, {
      maxDepth: 4,
      maxOutputChars: 2_000,
    });

    expect(JSON.parse(rendered)).toMatchObject({
      level: {
        child: {
          child: {
            child: {
              truncated: true,
              reason: 'max-depth',
            },
          },
        },
      },
    });
  });

  it('enforces the text output bound', () => {
    const output = boundRenderedText(`${longPrefix}${hiddenCanary}`, {
      maxOutputChars: 1_000,
    });

    expect(output.length).toBeLessThanOrEqual(1_000);
    expect(output).not.toContain(hiddenCanary);
    expect(output).toContain('output truncated');
  });

  it('does not expose raw previews in semantic step summaries', () => {
    const detail = runDetailSummary(db, 'run-safe');
    const rendered = JSON.stringify(detail);

    expect(rendered).not.toContain(hiddenCanary);
    expect(detail.steps).toEqual([
      expect.objectContaining({
        raw: {
          request: { present: true, chars: expect.any(Number) },
          response: { present: false, chars: 0 },
          chunks: { present: false, chars: 0 },
          providerOptions: { present: false, chars: 0 },
        },
      }),
    ]);
  });

  it('bounds tool arguments in the inspection view', () => {
    const inspection = inspectRun(db, 'run-safe', { maxChars: 100 });
    const rendered = JSON.stringify(inspection);

    expect(rendered).not.toContain(hiddenCanary);
    expect(inspection.tools).toMatchObject({
      calls: [
        {
          toolName: 'lookup',
          args: {
            truncated: true,
            chars: expect.any(Number),
          },
        },
      ],
    });
  });

  it('keeps timeline content opt-in and bounded', () => {
    const timeline = runDetailSummary(db, 'run-safe', { timeline: true });
    expect(JSON.stringify(timeline)).not.toContain('thinkingText');

    const spans = traceSpanSummaries(
      [
        {
          id: 'thinking',
          stepId: 'step-safe',
          label: 'Thinking',
          startMs: 0,
          durationMs: 1,
          depth: 1,
          kind: 'thinking',
          thinkingText: `${longPrefix}${hiddenCanary}`,
        },
      ],
      { includeContent: true, maxChars: 100 },
    );

    expect(JSON.stringify(spans)).not.toContain(hiddenCanary);
    expect(spans[0]).toMatchObject({
      thinkingText: { truncated: true, chars: expect.any(Number) },
    });
  });
});
