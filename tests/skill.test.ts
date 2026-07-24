import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const skillPath = path.resolve('.agents/skills/aisdk-dt-inspector/SKILL.md');

describe('repo-local skill', () => {
  it('documents the safe agent workflow without installing to personal skills', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');

    expect(skill).toContain('name: aisdk-dt-inspector');
    expect(skill).toContain('aisdk-dt --file <path>');
    expect(skill).toContain('aisdk-dt runs --limit 10 --file <path>');
    expect(skill).toContain(
      "aisdk-dt runs --limit 1 --json-path 'runs[0].id' --text --file <path>",
    );
    expect(skill).toContain(
      'Prefer `inspect`, `messages`, `steps`, `output`, `tools`, `usage`, and',
    );
    expect(skill).toContain(
      'Use `raw --json-path` before `raw --full`; quote JSON paths',
    );
    expect(skill).toContain(
      'Prompt messages are\n   omitted unless `--messages <number>` is explicitly requested.',
    );
    expect(skill).toContain('`timeline --include-content --max-chars 500`;');
    expect(skill).toContain('`--max-output-chars` guard');
    expect(skill).toContain('`--max-file-bytes`');
    expect(skill).not.toContain('includes recent messages');
    expect(skill).not.toContain('/Users/thomas.auger/.codex/skills');
    expect(skill).not.toContain('Hey Thomas');
  });
});
