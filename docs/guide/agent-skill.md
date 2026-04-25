# Agent Skill

This repository includes one agent skill:

```text
aisdk-dt-inspector
```

Use it when a coding agent needs to inspect AI SDK DevTools generation logs without pulling full prompts, provider payloads, or streamed chunks into context.

## Install The Skill

Install the skill with skills.sh:

```sh
npx skills add tom-auger/aisdk-dt --skill aisdk-dt-inspector
```

## Use The Skill

After installation, call the skill by name in your prompt:

```text
Use $aisdk-dt-inspector to inspect this generations.json file and summarize the failed run.
```

When working outside the app that produced the file, include an absolute path:

```text
Use $aisdk-dt-inspector to inspect /Users/me/app/.devtools/generations.json and explain why the latest run failed.
```

## What The Skill Encourages

The skill directs agents to:

- start with `runs`
- prefer `messages`, `steps`, `output`, `tools`, and `usage` before `raw`
- pass `--max-chars` whenever content may be large
- use `raw --json-path` before `raw --full`
- avoid copying sensitive prompts, request payloads, response payloads, or provider data into final answers unless explicitly asked

## When To Use It

Use the skill for questions like:

- why did the latest AI SDK request fail?
- what tools were available to the model?
- what tool calls and results happened during a run?
- what did the model receive in the prompt?
- what did the provider return?
- how many tokens did a run or step use?
