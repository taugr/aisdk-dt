import { describe, expect, it } from 'vitest';
import type {
  ContentPart,
  FilePart,
  ImagePart,
  ModelMessage,
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolCallPart,
  ToolResultPart,
} from 'ai';
import {
  customContentPartSchema,
  mediaContentPartSchema,
  promptMessageSchema,
  toolApprovalContentPartSchema,
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

const imagePart = {
  type: 'image',
  image: 'data:image/png;base64,fixture',
  mediaType: 'image/png',
} satisfies ImagePart;

const filePart = {
  type: 'file',
  data: { type: 'text', text: 'fixture' },
  filename: 'fixture.txt',
  mediaType: 'text/plain',
} satisfies FilePart;

const customPart = {
  type: 'custom',
  kind: 'fixture.metadata',
} satisfies ContentPart<Record<string, never>>;

const approvalRequest = {
  type: 'tool-approval-request',
  approvalId: 'approval-1',
  toolCallId: 'tc-1',
} satisfies ToolApprovalRequest;

const approvalResponse = {
  type: 'tool-approval-response',
  approvalId: 'approval-1',
  approved: true,
} satisfies ToolApprovalResponse;

const messages = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'Find the current status.' },
      imagePart,
      filePart,
    ],
  },
  {
    role: 'assistant',
    content: [toolCall, approvalRequest],
  },
  {
    role: 'tool',
    content: [toolResult, approvalResponse],
  },
] satisfies ModelMessage[];

describe('AI SDK type compatibility checks', () => {
  it('accepts AI SDK-typed tool call and result parts', () => {
    expect(toolCallContentPartSchema.safeParse(toolCall).success).toBe(true);
    expect(toolResultContentPartSchema.safeParse(toolResult).success).toBe(
      true,
    );
  });

  it('accepts AI SDK-typed model messages used by the CLI prompt parser', () => {
    for (const message of messages) {
      expect(promptMessageSchema.safeParse(message).success).toBe(true);
    }
  });

  it('accepts current AI SDK media, custom, and approval content parts', () => {
    expect(mediaContentPartSchema.safeParse(imagePart).success).toBe(true);
    expect(mediaContentPartSchema.safeParse(filePart).success).toBe(true);
    expect(customContentPartSchema.safeParse(customPart).success).toBe(true);
    expect(
      toolApprovalContentPartSchema.safeParse(approvalRequest).success,
    ).toBe(true);
    expect(
      toolApprovalContentPartSchema.safeParse(approvalResponse).success,
    ).toBe(true);
  });
});
