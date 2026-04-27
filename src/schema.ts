import { z } from 'zod';
import type {
  ParsedInput,
  ParsedOutput,
  ParsedUsage,
  PromptMessage,
  ReasoningContentPart,
  TextContentPart,
  ToolCallContentPart,
  ToolDefinition,
  ToolResultContentPart,
} from './types.js';

const nullableString = z.string().nullable();
const looseObject = z.record(z.string(), z.unknown());
const toolChoiceSchema = z.union([
  z.string(),
  z.object({ type: z.string().optional() }),
]);

export const textContentPartSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
  })
  .passthrough() satisfies z.ZodType<TextContentPart>;

export const toolCallContentPartSchema = z
  .object({
    type: z.literal('tool-call'),
    toolName: z.string(),
    toolCallId: z.string().optional(),
    args: z.union([looseObject, z.string()]).optional(),
    input: z.union([looseObject, z.string()]).optional(),
  })
  .passthrough() satisfies z.ZodType<ToolCallContentPart>;

export const toolResultContentPartSchema = z
  .object({
    type: z.literal('tool-result'),
    toolName: z.string().optional(),
    toolCallId: z.string().optional(),
    result: z.unknown().optional(),
    output: z.unknown().optional(),
  })
  .passthrough() satisfies z.ZodType<ToolResultContentPart>;

export const reasoningContentPartSchema = z
  .object({
    type: z.union([z.literal('reasoning'), z.literal('thinking')]).optional(),
    text: z.string().optional(),
    thinking: z.string().optional(),
    reasoning: z.string().optional(),
    toolCallId: z.string().optional(),
  })
  .passthrough() satisfies z.ZodType<ReasoningContentPart>;

export const contentPartSchema = z.union([
  textContentPartSchema,
  toolCallContentPartSchema,
  toolResultContentPartSchema,
  reasoningContentPartSchema,
]);

export const promptMessageSchema = z
  .object({
    role: z.union([
      z.literal('user'),
      z.literal('assistant'),
      z.literal('system'),
      z.literal('tool'),
    ]),
    content: z.union([z.string(), z.array(contentPartSchema)]),
  })
  .passthrough() satisfies z.ZodType<PromptMessage>;

export const toolDefinitionSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    parameters: looseObject.optional(),
  })
  .passthrough() satisfies z.ZodType<ToolDefinition>;

export const parsedUsageSchema = z
  .object({
    inputTokens: z
      .union([
        z.number(),
        z
          .object({
            total: z.number(),
            noCache: z.number().optional(),
            cacheRead: z.number().optional(),
            cacheWrite: z.number().optional(),
          })
          .passthrough(),
      ])
      .optional(),
    outputTokens: z
      .union([
        z.number(),
        z
          .object({
            total: z.number(),
            text: z.number().optional(),
            reasoning: z.number().optional(),
          })
          .passthrough(),
      ])
      .optional(),
    raw: z.unknown().optional(),
  })
  .passthrough() satisfies z.ZodType<ParsedUsage>;

export const parsedInputSchema = z
  .object({
    prompt: z.array(promptMessageSchema).optional(),
    tools: z.array(toolDefinitionSchema).optional(),
    temperature: z.number().optional(),
    maxOutputTokens: z.number().optional(),
    topP: z.number().optional(),
    topK: z.number().optional(),
    presencePenalty: z.number().optional(),
    frequencyPenalty: z.number().optional(),
    seed: z.number().optional(),
    responseFormat: z.unknown().optional(),
    toolChoice: toolChoiceSchema.optional(),
  })
  .passthrough() satisfies z.ZodType<ParsedInput>;

export const parsedOutputSchema = z
  .object({
    finishReason: z
      .union([
        z.string(),
        z
          .object({
            unified: z.string().optional(),
            raw: z.string().optional(),
          })
          .passthrough(),
      ])
      .optional(),
    toolCalls: z.array(toolCallContentPartSchema).optional(),
    textParts: z.array(textContentPartSchema).optional(),
    reasoningParts: z.array(reasoningContentPartSchema).optional(),
    content: z.array(contentPartSchema).optional(),
    objectText: z.string().optional(),
    response: z.unknown().optional(),
    usage: parsedUsageSchema.optional(),
  })
  .passthrough() satisfies z.ZodType<ParsedOutput>;

export const runSchema = z
  .object({
    id: z.string(),
    started_at: z.string(),
    parent_run_id: nullableString.optional(),
    parent_step_id: nullableString.optional(),
    function_id: nullableString.optional(),
  })
  .passthrough();

export const stepSchema = z
  .object({
    id: z.string(),
    run_id: z.string(),
    step_number: z.number(),
    type: z.union([z.literal('generate'), z.literal('stream')]),
    model_id: z.string(),
    provider: nullableString,
    started_at: z.string(),
    duration_ms: z.number().nullable(),
    input: z.string(),
    output: nullableString,
    usage: nullableString,
    error: nullableString,
    raw_request: nullableString,
    raw_response: nullableString,
    raw_chunks: nullableString,
    provider_options: nullableString,
  })
  .passthrough();

export const databaseSchema = z
  .object({
    runs: z.array(runSchema),
    steps: z.array(stepSchema),
  })
  .passthrough();
