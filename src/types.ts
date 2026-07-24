export interface Run {
  id: string;
  started_at: string;
  parent_run_id?: string | null;
  parent_step_id?: string | null;
  function_id?: string | null;
}

export interface Step {
  id: string;
  run_id: string;
  step_number: number;
  type: 'generate' | 'stream';
  model_id: string;
  provider: string | null;
  started_at: string;
  duration_ms: number | null;
  input: string;
  output: string | null;
  usage: string | null;
  error: string | null;
  raw_request: string | null;
  raw_response: string | null;
  raw_chunks: string | null;
  provider_options: string | null;
}

export interface Database {
  runs: Run[];
  steps: Step[];
}

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ToolCallContentPart {
  type: 'tool-call';
  toolName: string;
  toolCallId?: string;
  args?: Record<string, unknown> | string;
  input?: Record<string, unknown> | string;
}

export interface ToolResultContentPart {
  type: 'tool-result';
  toolName?: string;
  toolCallId?: string;
  result?: unknown;
  output?: unknown;
}

export interface ReasoningContentPart {
  type?: 'reasoning' | 'thinking';
  text?: string;
  thinking?: string;
  reasoning?: string;
  toolCallId?: string;
}

export interface MediaContentPart {
  type: 'image' | 'file' | 'reasoning-file';
  mediaType?: string;
  filename?: string;
  image?: unknown;
  data?: unknown;
  [key: string]: unknown;
}

export interface CustomContentPart {
  type: 'custom';
  kind?: string;
  [key: string]: unknown;
}

export interface ToolApprovalContentPart {
  type: 'tool-approval-request' | 'tool-approval-response';
  approvalId?: string;
  toolCallId?: string;
  approved?: boolean;
  reason?: string;
  [key: string]: unknown;
}

export interface UnknownContentPart {
  type?: string;
  unsupported: true;
  value?: unknown;
  [key: string]: unknown;
}

export type ContentPart =
  | TextContentPart
  | ToolCallContentPart
  | ToolResultContentPart
  | ReasoningContentPart
  | MediaContentPart
  | CustomContentPart
  | ToolApprovalContentPart
  | UnknownContentPart;

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface PromptMessage {
  role: MessageRole;
  content: string | ContentPart[];
}

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface ParsedInput {
  prompt?: PromptMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  responseFormat?: unknown;
  toolChoice?: string | { type?: string };
  [key: string]: unknown;
}

export interface ParsedOutput {
  finishReason?: string | { unified?: string; raw?: string };
  toolCalls?: ToolCallContentPart[];
  textParts?: TextContentPart[];
  reasoningParts?: ReasoningContentPart[];
  content?: ContentPart[];
  objectText?: string;
  response?: unknown;
  usage?: ParsedUsage;
  [key: string]: unknown;
}

export interface InputTokenBreakdown {
  total: number;
  noCache?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface OutputTokenBreakdown {
  total: number;
  text?: number;
  reasoning?: number;
}

export interface ParsedUsage {
  inputTokens?: number | InputTokenBreakdown;
  outputTokens?: number | OutputTokenBreakdown;
  raw?: unknown;
  [key: string]: unknown;
}

export interface ChildRun {
  run: Run & { isInProgress: boolean };
  steps: Step[];
  childRuns: ChildRun[];
}

export interface RunDetail {
  run: Run & { isInProgress: boolean };
  steps: Step[];
  childRuns: ChildRun[];
}

export type SpanKind = 'step' | 'thinking' | 'tool-call' | 'text' | 'error';

export interface TraceSpan {
  id: string;
  stepId: string;
  label: string;
  sublabel?: string;
  startMs: number;
  durationMs: number;
  depth: number;
  kind: SpanKind;
  tokens?: { input: number; output: number };
  modelId?: string;
  isInProgress?: boolean;
  toolCallId?: string;
  thinkingText?: string;
  textContent?: string;
}
