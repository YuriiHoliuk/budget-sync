/**
 * Analyzer module for calculating time spent based on conversation data from SQLite database
 */

import type { TimeTrackingConfig, ParsedMessage, TimeSegment, WorkSession, DailySummary, AnalysisResult, ToolCall } from "./types";
import {
  getMessagesForProject,
  getSessionsForProject,
  getTimeSegmentsForSession,
  insertSession,
  insertTimeSegment,
  deleteSegmentsForSession,
  type Message,
  type Session,
} from "./database";

const SESSION_BREAK_THRESHOLD_MINUTES = 120;

export async function analyzeProject(
  projectPath: string,
  config: TimeTrackingConfig,
): Promise<AnalysisResult> {
  const dbMessages = getMessagesForProject(projectPath);
  const messages = dbMessages.map(dbMessageToParsed);

  if (messages.length === 0) {
    return createEmptyResult(projectPath, config);
  }

  const sessions = groupIntoSessions(messages, config, projectPath);
  saveSessionsToDb(sessions);

  return buildAnalysisResult(projectPath, config, sessions, messages);
}

export async function getAnalysisFromDb(
  projectPath: string,
  config: TimeTrackingConfig,
): Promise<AnalysisResult> {
  const dbSessions = getSessionsForProject(projectPath);
  const dbMessages = getMessagesForProject(projectPath);
  const messages = dbMessages.map(dbMessageToParsed);

  if (dbSessions.length === 0) {
    return createEmptyResult(projectPath, config);
  }

  const sessions = dbSessions.map((dbSession) =>
    dbSessionToWorkSession(dbSession, projectPath),
  );

  return buildAnalysisResult(projectPath, config, sessions, messages);
}

function dbMessageToParsed(msg: Message): ParsedMessage {
  return {
    timestamp: new Date(msg.timestamp),
    type: msg.type,
    content: msg.content,
    sessionId: msg.sessionId,
    toolCalls: msg.toolCalls ? JSON.parse(msg.toolCalls) : [],
    uuid: msg.uuid,
  };
}

function dbSessionToWorkSession(dbSession: Session, projectPath: string): WorkSession {
  const segments = getTimeSegmentsForSession(dbSession.id!).map((seg) => ({
    id: `segment-${seg.id}`,
    sessionId: dbSession.sessionId,
    startTime: new Date(seg.startTime),
    endTime: new Date(seg.endTime),
    type: seg.type,
    durationMinutes: seg.durationMinutes,
    filesEdited: seg.filesEdited ? JSON.parse(seg.filesEdited).length : 0,
    subagentsCount: seg.subagentsCount,
  }));

  return {
    id: `session-${dbSession.id}`,
    projectPath,
    sessionId: dbSession.sessionId,
    startTime: new Date(dbSession.startTime),
    endTime: new Date(dbSession.endTime),
    taskSummary: dbSession.taskSummary || "",
    gitBranch: dbSession.gitBranch || "",
    segments,
  };
}

function groupIntoSessions(
  messages: ParsedMessage[],
  config: TimeTrackingConfig,
  projectPath: string,
): WorkSession[] {
  // Sort all user messages by timestamp, ignoring Claude session IDs
  const userMessages = messages
    .filter((msg) => msg.type === "user")
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (userMessages.length === 0) return [];

  const sessions: WorkSession[] = [];
  let currentSegments: TimeSegment[] = [];
  let segmentStartTime: Date | null = null;
  let sessionCounter = 1;
  let segmentCounter = 1;

  for (let index = 0; index < userMessages.length; index++) {
    const userMsg = userMessages[index];
    const prevUserMsg = index > 0 ? userMessages[index - 1] : null;

    if (!segmentStartTime) {
      segmentStartTime = userMsg.timestamp;
      continue;
    }

    const gapMinutes = prevUserMsg
      ? (userMsg.timestamp.getTime() - prevUserMsg.timestamp.getTime()) / (1000 * 60)
      : 0;

    if (gapMinutes <= config.sessionGapThreshold) {
      // Within gap threshold - continue current segment
      continue;
    }

    // Gap exceeded - create segment for previous work
    const allSegmentMessages = getMessagesInRange(messages, segmentStartTime, prevUserMsg!.timestamp);
    const segment = createTimeSegment(
      segmentStartTime,
      prevUserMsg!.timestamp,
      allSegmentMessages,
      config,
      gapMinutes,
      `segment-${segmentCounter}`,
      segmentCounter++,
    );
    currentSegments.push(segment);

    if (gapMinutes > SESSION_BREAK_THRESHOLD_MINUTES) {
      // Large gap - create work session and start new one
      if (currentSegments.length > 0) {
        sessions.push(createWorkSession(currentSegments, projectPath, `session-${sessionCounter}`, sessionCounter++, config));
        currentSegments = [];
        segmentCounter = 1;
      }
    }

    segmentStartTime = userMsg.timestamp;
  }

  // Handle final segment
  if (segmentStartTime && userMessages.length > 0) {
    const lastUserMsg = userMessages[userMessages.length - 1];
    const allSegmentMessages = getMessagesInRange(messages, segmentStartTime, lastUserMsg.timestamp);
    const segment = createTimeSegment(
      segmentStartTime,
      lastUserMsg.timestamp,
      allSegmentMessages,
      config,
      0,
      `segment-${segmentCounter}`,
      segmentCounter,
    );
    currentSegments.push(segment);
  }

  if (currentSegments.length > 0) {
    sessions.push(createWorkSession(currentSegments, projectPath, `session-${sessionCounter}`, sessionCounter, config));
  }

  return sessions;
}

function getMessagesInRange(messages: ParsedMessage[], start: Date, end: Date): ParsedMessage[] {
  return messages.filter((msg) => msg.timestamp >= start && msg.timestamp <= end);
}

function createTimeSegment(
  startTime: Date,
  endTime: Date,
  messages: ParsedMessage[],
  config: TimeTrackingConfig,
  gapAfterMinutes: number,
  sessionId: string,
  segmentId: number,
): TimeSegment {
  const filesEdited = extractFilesEdited(messages);
  const subagentsCount = countSubagents(messages);

  const durationMinutes = Math.max(0, (endTime.getTime() - startTime.getTime()) / (1000 * 60));

  let analysisTimeMinutes = 0;
  if (gapAfterMinutes > config.sessionGapThreshold) {
    const isComplex =
      filesEdited.size >= config.complexFileEditThreshold ||
      subagentsCount >= config.complexSubagentThreshold;

    if (isComplex) {
      analysisTimeMinutes = config.complexAnalysisMinutes;
    } else if (filesEdited.size > 0 || subagentsCount > 0) {
      analysisTimeMinutes = config.simpleAnalysisMinutes;
    }
  }

  const totalDuration = Math.round(durationMinutes + analysisTimeMinutes);

  return {
    id: `segment-${segmentId}`,
    sessionId,
    startTime,
    endTime,
    type: "work",
    durationMinutes: totalDuration,
    filesEdited: filesEdited.size,
    subagentsCount,
  };
}

function createWorkSession(
  segments: TimeSegment[],
  projectPath: string,
  sessionId: string,
  sessionNumber: number,
  config: TimeTrackingConfig,
): WorkSession {
  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];

  const prepStartTime = new Date(firstSegment.startTime.getTime() - config.prepTimeMinutes * 60 * 1000);
  const prepSegment: TimeSegment = {
    id: `segment-prep-${sessionNumber}`,
    sessionId,
    startTime: prepStartTime,
    endTime: firstSegment.startTime,
    type: "prep",
    durationMinutes: config.prepTimeMinutes,
    filesEdited: 0,
    subagentsCount: 0,
  };

  // Generate deterministic session ID based on date+time to merge overlapping Claude sessions
  const dateStr = firstSegment.startTime.toISOString().split("T")[0];
  const hourStr = firstSegment.startTime.toISOString().split("T")[1].slice(0, 2);
  const syntheticSessionId = `${dateStr}-${hourStr}-${sessionNumber}`;

  return {
    id: `session-${sessionNumber}`,
    projectPath,
    sessionId: syntheticSessionId,
    startTime: prepStartTime,
    endTime: lastSegment.endTime,
    taskSummary: "",
    gitBranch: "",
    segments: [prepSegment, ...segments],
  };
}

function saveSessionsToDb(sessions: WorkSession[]): void {
  for (const session of sessions) {
    const dbSessionId = insertSession({
      projectPath: session.projectPath,
      sessionId: session.sessionId,
      startTime: session.startTime.toISOString(),
      endTime: session.endTime.toISOString(),
      taskSummary: session.taskSummary || null,
      gitBranch: session.gitBranch || null,
      gitCommits: null,
    });

    // Delete existing segments before inserting to avoid duplicates
    deleteSegmentsForSession(dbSessionId);

    for (const segment of session.segments) {
      const filesEdited = segment.filesEdited > 0 ? JSON.stringify(Array(segment.filesEdited).fill("")) : null;
      insertTimeSegment({
        sessionId: dbSessionId,
        startTime: segment.startTime.toISOString(),
        endTime: segment.endTime.toISOString(),
        type: segment.type as "prep" | "work" | "analysis" | "gap",
        durationMinutes: segment.durationMinutes,
        filesEdited,
        subagentsCount: segment.subagentsCount,
      });
    }
  }
}

function buildAnalysisResult(
  projectPath: string,
  config: TimeTrackingConfig,
  sessions: WorkSession[],
  messages: ParsedMessage[],
): AnalysisResult {
  const dailySummaries = createDailySummaries(sessions);
  const totalMinutes = sessions.reduce(
    (sum, session) => sum + session.segments.reduce((segSum, seg) => segSum + seg.durationMinutes, 0),
    0,
  );
  const totalMessages = messages.filter((msg) => msg.type === "user").length;

  const allTimestamps = messages.map((msg) => msg.timestamp);
  const dateRange = {
    start: allTimestamps.length > 0 ? new Date(Math.min(...allTimestamps.map((d) => d.getTime()))) : new Date(),
    end: allTimestamps.length > 0 ? new Date(Math.max(...allTimestamps.map((d) => d.getTime()))) : new Date(),
  };

  return {
    projectPath,
    config,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    totalMinutes,
    totalSessions: sessions.length,
    totalMessages,
    dateRange,
    dailySummaries,
    sessions,
  };
}

function createDailySummaries(sessions: WorkSession[]): DailySummary[] {
  const byDate = new Map<string, WorkSession[]>();

  for (const session of sessions) {
    const date = session.startTime.toISOString().split("T")[0];
    const existing = byDate.get(date) || [];
    existing.push(session);
    byDate.set(date, existing);
  }

  const summaries: DailySummary[] = [];

  for (const [date, dateSessions] of byDate) {
    const totalMinutes = dateSessions.reduce(
      (sum, session) => sum + session.segments.reduce((segSum, seg) => segSum + seg.durationMinutes, 0),
      0,
    );

    summaries.push({
      date,
      totalMinutes,
      sessionsCount: dateSessions.length,
    });
  }

  summaries.sort((a, b) => a.date.localeCompare(b.date));
  return summaries;
}

function extractFilesEdited(messages: ParsedMessage[]): Set<string> {
  const files = new Set<string>();
  for (const msg of messages) {
    for (const toolCall of msg.toolCalls) {
      if (toolCall.name === "Edit" || toolCall.name === "Write") {
        const filePath = toolCall.input.file_path;
        if (typeof filePath === "string") {
          files.add(filePath);
        }
      }
    }
  }
  return files;
}

function countSubagents(messages: ParsedMessage[]): number {
  let count = 0;
  for (const msg of messages) {
    for (const toolCall of msg.toolCalls) {
      if (toolCall.name === "Task") {
        count++;
      }
    }
  }
  return count;
}

function createEmptyResult(projectPath: string, config: TimeTrackingConfig): AnalysisResult {
  return {
    projectPath,
    config,
    totalHours: 0,
    totalMinutes: 0,
    totalSessions: 0,
    totalMessages: 0,
    dateRange: { start: new Date(), end: new Date() },
    dailySummaries: [],
    sessions: [],
  };
}
