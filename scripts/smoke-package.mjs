import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const fixturePath = path.join(
  projectRoot,
  'tests',
  'fixtures',
  'basic-generations.json',
);
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'aisdk-dt-package-smoke-'),
);
const consumerDirectory = path.join(temporaryRoot, 'consumer');

try {
  fs.mkdirSync(consumerDirectory, { recursive: true });
  run('pnpm', ['pack', '--pack-destination', temporaryRoot], projectRoot);

  const tarball = fs
    .readdirSync(temporaryRoot)
    .find((entry) => entry.endsWith('.tgz'));
  if (!tarball) throw new Error('Package tarball was not created.');

  fs.writeFileSync(
    path.join(consumerDirectory, 'package.json'),
    JSON.stringify({ name: 'aisdk-dt-smoke-consumer', private: true }),
  );
  run(
    'pnpm',
    ['add', '--offline', '--ignore-scripts', path.join(temporaryRoot, tarball)],
    consumerDirectory,
  );

  const binary = path.join(
    consumerDirectory,
    'node_modules',
    '.bin',
    'aisdk-dt',
  );
  const version = run(binary, ['--version'], consumerDirectory);
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
  );
  if (version.trim() !== packageJson.version) {
    throw new Error(
      `Packed binary reported ${version.trim()}, expected ${packageJson.version}.`,
    );
  }

  const runId = run(
    binary,
    [
      'runs',
      '--file',
      fixturePath,
      '--limit',
      '1',
      '--json-path',
      'runs[0].id',
      '--text',
    ],
    consumerDirectory,
  );
  if (runId.trim() !== 'run-basic') {
    throw new Error(
      `Packed binary returned unexpected run ID: ${runId.trim()}`,
    );
  }

  console.log('Packed package smoke test passed.');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed (${result.status}): ${command} ${args.join(' ')}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return result.stdout;
}
