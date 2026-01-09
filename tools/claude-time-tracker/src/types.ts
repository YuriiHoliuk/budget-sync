export interface TimeTrackingConfig {
  sessionGapThreshold: number;
  prepTimeMinutes: number;
  complexAnalysisMinutes: number;
  simpleAnalysisMinutes: number;
  complexFileEditThreshold: number;
  complexSubagentThreshold: number;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ParsedMessage {
  timestamp: Date;
  type: string;
  content: string;
  sessionId: string;
  toolCalls: ToolCall[];
  uuid: string;
}

export interface TimeSegment {
  id: string;
  sessionId: string;
  startTime: Date;
  endTime: Date;
  type: string;
  durationMinutes: number;
  filesEdited: number;
  subagentsCount: number;
}

export interface WorkSession {
  id: string;
  projectPath: string;
  sessionId: string;
  startTime: Date;
  endTime: Date;
  taskSummary: string;
  gitBranch: string;
  segments: TimeSegment[];
}

export interface DailySummary {
  date: string;
  totalMinutes: number;
  sessionsCount: number;
}

export interface AnalysisResult {
  projectPath: string;
  config: TimeTrackingConfig;
  totalHours: number;
  totalMinutes: number;
  totalSessions: number;
  totalMessages: number;
  dateRange: { start: Date; end: Date };
  dailySummaries: DailySummary[];
  sessions: WorkSession[];
}
