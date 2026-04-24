import { describe, expect, it } from 'vitest';
import type { ModelMessage, ToolCallPart, ToolResultPart } from 'ai';
import {
  promptMessageSchema,
  toolCallContentPartSchema,
  toolResultContentPartSchema,
} from '../src/schema.js';

const toolCall = {
  type: 'tool-call',
  toolName: 'lookupStatus',
  toolCallId: 'tc-1',
  input: { id: 'abc' },
} satisfies ToolCallPart;

const toolResult = {
  type: 'tool-result',
  toolName: 'lookupStatus',
  toolCallId: 'tc-1',
  output: { type: 'json', value: { status: 'ready' } },
} satisfies ToolResultPart;

const messages = [
  {
    role: 'user',
    content: 'Find the current status.',
  },
  {
    role: 'assistant',
    content: [toolCall],
  },
  {
    role: 'tool',
    content: [toolResult],
  },
] satisfies ModelMessage[];

describe('AI SDK type compatibility checks', () => {
  it('accepts AI SDK-typed tool call and result parts', () => {
    expect(toolCallContentPartSchema.safeParse(toolCall).success).toBe(true);
    expect(toolResultContentPartSchema.safeParse(toolResult).success).toBe(true);
  });

  it('accepts AI SDK-typed model messages used by the CLI prompt parser', () => {
    for (const message of messages) {
      expect(promptMessageSchema.safeParse(message).success).toBe(true);
    }
  });
});
