export type LogType = 'info' | 'warn' | 'error' | 'debug' | 'claude' | 'tool' | 'system';

export interface LogEntry {
  id: string;
  type: LogType;
  content: string;
  timestamp: Date;
  metadata?: {
    toolName?: string;
    codeLanguage?: string;
    isCodeBlock?: boolean;
  };
}

export interface TuiState {
  logs: LogEntry[];
  currentIteration: number;
  maxIterations: number;
  status: 'idle' | 'running' | 'rate-limited' | 'stopped';
  inputTokens: number;
  outputTokens: number;
  cost: number;
  startTime: Date | null;
  isRunning: boolean;
}

export interface ClaudeProcessHandle {
  write: (input: string) => void;
  kill: () => void;
  isRunning: boolean;
}

export interface TuiConfig {
  maxIterations: number;
  model: string;
  promptFile: string;
  exitSignal: string;
  rateLimitDelay: number;
  verbose: boolean;
  cwd: string;
  mockMode: boolean;
  mockScenario?: string;
}
