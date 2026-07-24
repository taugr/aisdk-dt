import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const documentationFiles = [
  'README.md',
  'docs/.vitepress/config.ts',
  ...fs
    .readdirSync(path.resolve('docs/guide'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `docs/guide/${name}`),
  'examples/simple-chatbot/README.md',
];

const documentation = documentationFiles
  .map((file) => fs.readFileSync(path.resolve(file), 'utf8'))
  .join('\n');

describe('documentation contracts', () => {
  it('uses the tested latest-run JSON path', () => {
    expect(documentation).toContain('runs[0].id');
    expect(documentation).not.toContain('items[0].id');
  });

  it('uses canonical repository and documentation URLs', () => {
    expect(documentation).toContain('https://taugr.github.io/aisdk-dt/');
    expect(documentation).not.toContain(
      'https://tom-auger.github.io/aisdk-dt/',
    );
    expect(documentation).not.toContain(
      'https://github.com/tom-auger/aisdk-dt',
    );
  });

  it('documents the global bounds and opt-in timeline content', () => {
    expect(documentation).toContain('--max-output-chars');
    expect(documentation).toContain('--max-file-bytes');
    expect(documentation).toContain('--include-content');
    expect(documentation).toContain('unsupported: true');
  });
});
