import { describe, expect, it } from 'vitest';
import { renderText } from '../src/render-text.js';

describe('text rendering', () => {
  it('returns selected primitive values without JSON quoting', () => {
    expect(renderText('run-123')).toBe('run-123');
    expect(renderText(42)).toBe('42');
  });

  it('renders run lists as one stable line per run', () => {
    expect(
      renderText({
        runs: [
          {
            id: 'run-1',
            startedAt: '2026-01-01T00:00:00.000Z',
            firstMessage: 'hello',
            stepCount: 2,
            hasError: false,
          },
        ],
      }),
    ).toBe('run-1 2026-01-01T00:00:00.000Z hello steps=2 error=false');
  });

  it('renders usage with cache details', () => {
    expect(
      renderText({
        targetType: 'step',
        stepId: 'step-1',
        usage: {
          input: { total: 100, noCache: 50, cacheRead: 50 },
          output: { total: 20, text: 15, reasoning: 5 },
        },
      }),
    ).toContain('cacheHit=50.0%');
  });

  it('renders a content-free timeline from metadata', () => {
    const rendered = renderText({
      runId: 'run-1',
      spans: [
        {
          startMs: 0,
          depth: 0,
          kind: 'step',
          label: 'model',
          durationMs: 25,
        },
      ],
    });

    expect(rendered).toContain('run run-1 spans=1');
    expect(rendered).toContain('0ms step model duration=25ms');
    expect(rendered).not.toContain('textContent');
  });
});
