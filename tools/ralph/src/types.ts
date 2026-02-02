export interface RalphConfig {
  maxIterations: number;
  model: string;
  promptFile: string;
  exitSignal: string;
  rateLimitDelay: number;
  verbose: boolean;
  mockMode: boolean;
  cwd: string;
}

export interface ClaudeMessageContent {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface ClaudeStreamEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  message?: {
    type: string;
    role?: string;
    model?: string;
    content: ClaudeMessageContent[] | string;
  };
  tool_use?: {
    name: string;
    id: string;
  };
  result?:
    | string
    | {
        content: string;
        is_error: boolean;
      };
  content?: string;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  is_error?: boolean;
  num_turns?: number;
  total_cost_usd?: number;
}

export interface ClaudeRunResult {
  success: boolean;
  output: string;
  exitCode: number;
  error?: string;
  isRateLimited?: boolean;
  cost?: number;
  durationMs?: number;
}

export interface IterationResult {
  iteration: number;
  result: ClaudeRunResult;
  durationMs: number;
  shouldExit: boolean;
  exitReason?: 'signal' | 'max_iterations' | 'error' | 'user_interrupt';
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

export interface RalphLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  claudeOutput(content: string): void;
  toolStart(name: string): void;
  toolEnd(name: string, isError: boolean): void;
  iterationStart(iteration: number, maxIterations: number): void;
  iterationEnd(
    iteration: number,
    durationMs: number,
    exitCode: number,
  ): void;
  banner(title: string, config: Partial<RalphConfig>): void;
  complete(
    iterations: number,
    totalDurationMs: number,
    reason: string,
  ): void;
}
