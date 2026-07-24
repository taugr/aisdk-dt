import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const runCount = Number(process.env.AISDK_DT_BENCHMARK_RUNS ?? 5_000);
const stepsPerRun = Number(process.env.AISDK_DT_BENCHMARK_STEPS ?? 4);
const iterations = Number(process.env.AISDK_DT_BENCHMARK_ITERATIONS ?? 3);
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'aisdk-dt-benchmark-'),
);
const databasePath = path.join(temporaryDirectory, 'generations.json');
const cliPath = path.resolve('dist/cli.js');
const baselineCliPath = process.env.AISDK_DT_BENCHMARK_BASELINE_CLI
  ? path.resolve(process.env.AISDK_DT_BENCHMARK_BASELINE_CLI)
  : null;

try {
  const database = makeDatabase(runCount, stepsPerRun);
  fs.writeFileSync(databasePath, JSON.stringify(database), 'utf8');
  const latestRunId = `run-${runCount - 1}`;
  const commands = [
    ['runs', '--limit', '10'],
    ['inspect', latestRunId],
    ['messages', latestRunId, '--limit', '12'],
    ['tools', latestRunId],
    ['usage', latestRunId],
    ['timeline', latestRunId],
  ];

  const results = measureCommands(cliPath, commands, true);
  const baselineResults = baselineCliPath
    ? measureCommands(baselineCliPath, commands, false)
    : null;
  const comparison = baselineResults
    ? results.map((result, index) => ({
        command: result.command,
        baselineMeanMs: baselineResults[index].meanMs,
        indexedMeanMs: result.meanMs,
        speedup: round(baselineResults[index].meanMs / result.meanMs),
      }))
    : null;

  console.log(
    JSON.stringify(
      {
        fixture: {
          runs: runCount,
          steps: database.steps.length,
          bytes: fs.statSync(databasePath).size,
          rawPayloadCharsPerStep: 2_000,
        },
        iterations,
        results,
        ...(baselineResults
          ? {
              baseline: {
                cli: baselineCliPath,
                results: baselineResults,
              },
              comparison,
            }
          : {}),
      },
      null,
      2,
    ),
  );
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

function measureCommands(binary, commands, supportsOutputBudget) {
  return commands.map((args) => {
    run(binary, args, supportsOutputBudget);
    const timings = [];
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const start = performance.now();
      run(binary, args, supportsOutputBudget);
      timings.push(performance.now() - start);
    }
    return {
      command: `aisdk-dt ${args.join(' ')}`,
      meanMs: round(mean(timings)),
      minMs: round(Math.min(...timings)),
      maxMs: round(Math.max(...timings)),
    };
  });
}

function run(binary, args, supportsOutputBudget) {
  const result = spawnSync(
    process.execPath,
    [
      binary,
      ...args,
      '--file',
      databasePath,
      ...(supportsOutputBudget ? ['--max-output-chars', '32000'] : []),
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || `Command failed: ${args.join(' ')}`);
  }
}

function makeDatabase(numberOfRuns, numberOfSteps) {
  const runs = [];
  const steps = [];
  for (let runIndex = 0; runIndex < numberOfRuns; runIndex += 1) {
    const runId = `run-${runIndex}`;
    const startedAt = new Date(
      Date.UTC(2026, 0, 1) + runIndex * 1_000,
    ).toISOString();
    runs.push({
      id: runId,
      started_at: startedAt,
      parent_run_id:
        runIndex > 0 && runIndex % 50 === 0 ? `run-${runIndex - 1}` : null,
    });
    for (let stepIndex = 0; stepIndex < numberOfSteps; stepIndex += 1) {
      const toolCallId = `call-${runIndex}-${stepIndex}`;
      steps.push({
        id: `step-${runIndex}-${stepIndex}`,
        run_id: runId,
        step_number: stepIndex + 1,
        type: 'generate',
        model_id: 'benchmark-model',
        provider: 'benchmark-provider',
        started_at: startedAt,
        duration_ms: 25,
        input: JSON.stringify({
          prompt: [
            { role: 'user', content: `Question for ${runId}` },
            ...(stepIndex
              ? [
                  {
                    role: 'tool',
                    content: [
                      {
                        type: 'tool-result',
                        toolName: 'lookup',
                        toolCallId,
                        result: { value: stepIndex },
                      },
                    ],
                  },
                ]
              : []),
          ],
          tools: [{ name: 'lookup', description: 'Benchmark lookup' }],
        }),
        output: JSON.stringify({
          finishReason: stepIndex === numberOfSteps - 1 ? 'stop' : 'tool-calls',
          content:
            stepIndex === numberOfSteps - 1
              ? [{ type: 'text', text: `Answer for ${runId}` }]
              : [
                  {
                    type: 'tool-call',
                    toolName: 'lookup',
                    toolCallId,
                    input: { stepIndex },
                  },
                ],
        }),
        usage: JSON.stringify({ inputTokens: 100, outputTokens: 25 }),
        error: null,
        raw_request: null,
        raw_response: JSON.stringify([
          { type: 'response.created' },
          { type: 'finish', finishReason: 'stop' },
        ]),
        raw_chunks: JSON.stringify([{ payload: 'x'.repeat(2_000) }]),
        provider_options: null,
      });
    }
  }
  return { runs, steps };
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value) {
  return Math.round(value * 10) / 10;
}
