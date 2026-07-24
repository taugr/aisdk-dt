import { describe, expect, it } from 'vitest';
import {
  getMessagesForRun,
  inspectRun,
  runDetailSummary,
  toolsForTarget,
} from '../src/generations.js';
import { readFixture } from './helpers/fixtures.js';

describe('sanitized DevTools fixtures', () => {
  it.each([
    'basic-generations.json',
    'tool-and-nested-generations.json',
    'multimodal-and-error-generations.json',
  ])('parses %s', (name) => {
    const db = readFixture(name);

    expect(db.runs.length).toBeGreaterThan(0);
    expect(db.steps.length).toBeGreaterThan(0);
  });

  it('represents tool calls, results, and nested in-progress runs', () => {
    const db = readFixture('tool-and-nested-generations.json');

    expect(toolsForTarget(db, 'run-tool')).toMatchObject({
      summary: {
        toolCallCount: 1,
        pairedToolResultCount: 1,
      },
    });
    expect(toolsForTarget(db, 'run-terminal-tool')).toMatchObject({
      summary: {
        toolCallCount: 1,
        unpairedTerminalToolCallCount: 1,
      },
      calls: [
        {
          toolCallId: 'fixture-terminal-call',
          relationship: 'terminal-unpaired-call',
        },
      ],
    });
    expect(
      runDetailSummary(db, 'run-tool', { includeChildren: true }),
    ).toMatchObject({
      childRuns: [
        {
          run: {
            id: 'run-child',
            isInProgress: true,
          },
        },
      ],
    });
  });

  it('preserves known multimodal metadata and unknown content locally', () => {
    const db = readFixture('multimodal-and-error-generations.json');
    const messages = getMessagesForRun(db, 'run-multimodal', {
      includeSystem: true,
    });

    expect(messages).toEqual([
      expect.objectContaining({
        role: 'user',
        text: 'Describe the fixture attachment.',
        attachmentCount: 2,
        unsupportedPartCount: 1,
        otherParts: expect.arrayContaining([
          expect.objectContaining({
            type: 'image',
            mediaType: 'image/png',
            unsupported: false,
          }),
          expect.objectContaining({
            type: 'file',
            filename: 'fixture.txt',
            unsupported: false,
          }),
          expect.objectContaining({
            type: 'source',
            sourceType: 'url',
            sourceId: 'fixture-source',
            url: 'https://example.invalid/fixture',
            unsupported: false,
          }),
          expect.objectContaining({
            type: 'future-part',
            unsupported: true,
          }),
        ]),
      }),
    ]);

    expect(inspectRun(db, 'run-multimodal')).toMatchObject({
      run: {
        status: 'error',
      },
      steps: [
        {
          outputSummary: {
            type: 'error',
          },
        },
      ],
    });
  });
});
