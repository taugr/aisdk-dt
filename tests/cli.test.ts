import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixturePath } from './helpers/fixtures.js';

const cliPath = path.resolve('dist/cli.js');
const packageJson = JSON.parse(
  fs.readFileSync(path.resolve('package.json'), 'utf8'),
) as { version: string };

function runCli(args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

describe('CLI contract', () => {
  it('reports the package version', () => {
    const result = runCli(['--version']);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
    expect(result.stderr).toBe('');
  });

  it('selects the latest run ID with a JSON path', () => {
    const result = runCli([
      'runs',
      '--file',
      fixturePath('basic-generations.json'),
      '--limit',
      '1',
      '--json-path',
      'runs[0].id',
      '--text',
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('run-basic');
  });

  it.each([
    ['default inspection', []],
    ['inspect', ['inspect', 'run-basic']],
    ['final', ['final', 'run-basic']],
    ['runs', ['runs', '--limit', '1']],
    ['run', ['run', 'run-basic']],
    ['steps', ['steps', 'run-basic']],
    ['step', ['step', 'step-basic']],
    ['messages', ['messages', 'run-basic']],
    ['output', ['output', 'step-basic']],
    ['tools', ['tools', 'run-basic']],
    ['usage', ['usage', 'run-basic']],
    ['raw', ['raw', 'step-basic', '--response']],
    ['timeline', ['timeline', 'run-basic']],
    ['events', ['events', 'step-basic']],
  ])('runs the %s command against a fixture', (_name, commandArgs) => {
    const result = runCli([
      ...commandArgs,
      '--file',
      fixturePath('basic-generations.json'),
    ]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it('keeps default inspection bounded and omits raw response content', () => {
    const result = runCli([
      '--file',
      fixturePath('basic-generations.json'),
      '--max-output-chars',
      '2000',
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout.length).toBeLessThanOrEqual(2_001);
    expect(result.stdout).not.toContain('fixture-response');
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it('keeps timeline content opt-in', () => {
    const fixture = fixturePath('multimodal-and-error-generations.json');
    const defaultResult = runCli([
      'timeline',
      'run-multimodal',
      '--file',
      fixture,
    ]);
    const contentResult = runCli([
      'timeline',
      'run-multimodal',
      '--include-content',
      '--max-chars',
      '20',
      '--file',
      fixture,
    ]);

    expect(defaultResult.status).toBe(0);
    expect(defaultResult.stdout).not.toContain('textContent');
    expect(contentResult.status).toBe(0);
    expect(contentResult.stdout).toContain('textContent');
  });

  it('returns selected complete content only with an explicit --full', () => {
    const result = runCli([
      'raw',
      'step-basic',
      '--response',
      '--full',
      '--file',
      fixturePath('basic-generations.json'),
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('fixture-response');
  });

  it.each([
    [['runs', '--limit', '0'], 'Expected a positive integer'],
    [['runs', '--offset', '-1'], 'Expected a non-negative integer'],
    [['runs', '--since', 'not-a-date'], 'Invalid ISO date'],
    [['messages', '--role', 'developer'], 'Invalid role'],
    [['step', 'step-basic', '--section', 'everything'], 'Invalid section'],
    [
      ['runs', '--max-output-chars', '100'],
      'Expected at least 256 output characters',
    ],
  ])('rejects invalid options without loading a database', (args, message) => {
    const result = runCli(args);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it('reports unknown targets without an internal stack trace', () => {
    const result = runCli([
      'tools',
      'missing',
      '--file',
      fixturePath('basic-generations.json'),
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe('Run or step not found: missing');
    expect(result.stderr).not.toContain('at toolsForTarget');
  });

  it.each([
    [
      'missing file',
      path.join(os.tmpdir(), 'aisdk-dt-does-not-exist.json'),
      'ENOENT',
    ],
    [
      'invalid JSON',
      writeDatabase('{"runs":'),
      'Could not parse generations database',
    ],
    [
      'schema mismatch',
      writeDatabase(JSON.stringify({ runs: [{}], steps: [] })),
      'Invalid generations database',
    ],
  ])('reports a concise %s error', (_name, file, message) => {
    const result = runCli(['runs', '--file', file]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(result.stderr).not.toContain('at readDatabase');
  });

  it('reports an empty database and a missing JSON path', () => {
    const empty = writeDatabase(JSON.stringify({ runs: [], steps: [] }));
    const noRuns = runCli(['--file', empty]);
    const missingPath = runCli([
      'runs',
      '--file',
      fixturePath('basic-generations.json'),
      '--json-path',
      'runs[4].id',
    ]);

    expect(noRuns.status).toBe(1);
    expect(noRuns.stderr.trim()).toBe('No root runs found.');
    expect(missingPath.status).toBe(1);
    expect(missingPath.stderr.trim()).toBe('JSON path not found: runs[4].id');
  });
});

function writeDatabase(content: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aisdk-dt-cli-'));
  const file = path.join(directory, 'generations.json');
  fs.writeFileSync(file, content, 'utf8');
  return file;
}
