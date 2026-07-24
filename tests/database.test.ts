import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findLatestRun,
  findRun,
  findStep,
  getMessagesForRun,
  readDatabase,
  runsNewestFirst,
  stepsForRun,
} from '../src/generations.js';
import type { Database, Run, Step } from '../src/types.js';

describe('database loading and indexes', () => {
  it('indexes run, step, child, and latest-run lookups', () => {
    const db = syntheticDatabase(10_000);

    expect(findRun(db, 'run-9999')?.id).toBe('run-9999');
    expect(findStep(db, 'step-9999')?.run_id).toBe('run-9999');
    expect(stepsForRun(db, 'run-9999').map((step) => step.id)).toEqual([
      'step-9999',
    ]);
    expect(findLatestRun(db)?.id).toBe('run-9999');
    expect(
      runsNewestFirst(db)
        .slice(0, 2)
        .map((run) => run.id),
    ).toEqual(['run-9999', 'run-9998']);
  });

  it('recovers when a partial write becomes valid during the retry window', () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'aisdk-dt-retry-'),
    );
    const databasePath = path.join(temporaryDirectory, 'generations.json');
    const validDatabase = JSON.stringify(syntheticDatabase(1));
    fs.writeFileSync(databasePath, '{"runs":', 'utf8');
    const writer = spawn(
      process.execPath,
      [
        '-e',
        "setTimeout(() => require('node:fs').writeFileSync(process.argv[1], process.argv[2]), 25)",
        databasePath,
        validDatabase,
      ],
      { stdio: 'ignore' },
    );

    try {
      const db = readDatabase(databasePath, {
        attempts: 3,
        retryDelayMs: 75,
      });

      expect(db.runs).toHaveLength(1);
    } finally {
      writer.kill();
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('fails concisely when invalid JSON remains unchanged', () => {
    const databasePath = writeTemporaryDatabase('{"runs":');

    expect(() =>
      readDatabase(databasePath, { attempts: 3, retryDelayMs: 0 }),
    ).toThrow(
      /Could not parse generations database after 2 read attempts.*mid-write/,
    );
  });

  it('rejects oversized files before parsing and permits an explicit limit', () => {
    const content = JSON.stringify(syntheticDatabase(1));
    const databasePath = writeTemporaryDatabase(content);

    expect(() =>
      readDatabase(databasePath, { maxBytes: content.length - 1 }),
    ).toThrow(/exceeding the .* safety limit.*--max-file-bytes/);
    expect(
      readDatabase(databasePath, { maxBytes: content.length + 1 }).runs,
    ).toHaveLength(1);
  });

  it('keeps parsed step fields scoped to each database load', () => {
    const databasePath = writeTemporaryDatabase(
      JSON.stringify(syntheticDatabase(1, 'first message')),
    );
    const first = readDatabase(databasePath);
    fs.writeFileSync(
      databasePath,
      JSON.stringify(syntheticDatabase(1, 'second message')),
      'utf8',
    );
    const second = readDatabase(databasePath);

    expect(getMessagesForRun(first, 'run-0')[0]?.text).toBe('first message');
    expect(getMessagesForRun(second, 'run-0')[0]?.text).toBe('second message');
  });
});

function syntheticDatabase(
  count: number,
  message = 'fixture message',
): Database {
  const runs: Run[] = [];
  const steps: Step[] = [];
  for (let index = 0; index < count; index += 1) {
    const startedAt = new Date(
      Date.UTC(2026, 0, 1) + index * 1_000,
    ).toISOString();
    runs.push({
      id: `run-${index}`,
      started_at: startedAt,
      parent_run_id: null,
    });
    steps.push({
      id: `step-${index}`,
      run_id: `run-${index}`,
      step_number: 1,
      type: 'generate',
      model_id: 'fixture-model',
      provider: 'fixture-provider',
      started_at: startedAt,
      duration_ms: 10,
      input: JSON.stringify({
        prompt: [{ role: 'user', content: message }],
      }),
      output: JSON.stringify({
        content: [{ type: 'text', text: `response ${index}` }],
      }),
      usage: JSON.stringify({ inputTokens: 2, outputTokens: 3 }),
      error: null,
      raw_request: null,
      raw_response: null,
      raw_chunks: null,
      provider_options: null,
    });
  }
  return { runs, steps };
}

function writeTemporaryDatabase(content: string): string {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'aisdk-dt-database-'),
  );
  const databasePath = path.join(temporaryDirectory, 'generations.json');
  fs.writeFileSync(databasePath, content, 'utf8');
  return databasePath;
}
