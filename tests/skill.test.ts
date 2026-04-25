import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const skillPath = path.resolve(
  '.agents/skills/aisdk-dt-inspector/SKILL.md',
);

describe('repo-local skill', () => {
  it('documents the safe agent workflow without installing to personal skills', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');

    expect(skill).toContain('name: aisdk-dt-inspector');
    expect(skill).toContain('aisdk-dt runs --limit 10 --file <path>');
    expect(skill).toContain(
      'Prefer `messages`, `steps`, `output`, `tools`, and `usage` before `raw`.',
    );
    expect(skill).toContain(
      'Use `raw --json-path` before `raw --full`; quote JSON paths',
    );
    expect(skill).not.toContain('/Users/thomas.auger/.codex/skills');
    expect(skill).not.toContain('Hey Thomas');
  });
});
