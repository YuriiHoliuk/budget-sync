import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAndSaveMessages } from "./parser";
import { summarizeAllUnsummarized } from "./summarizer";
import { DEFAULT_CONFIG } from "./config";
import {
  initDatabase,
  getMessagesForProject,
  getMessagesForProjectAndDate,
  getSessionsForProject,
  getTimeSegmentsForSession,
  insertSession,
  insertTimeSegment,
} from "./database";
import type {
  TimeTrackingConfig,
  AnalysisResult,
  WorkSession,
  DailySummary,
  TimeSegment,
} from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const DEFAULT_PORT = 3847;

let currentConfig: TimeTrackingConfig = { ...DEFAULT_CONFIG };

initDatabase();

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    svg: "image/svg+xml",
    ico: "image/x-icon",
  };
  return types[ext || ""] || "application/octet-stream";
}

async function serveStaticFile(path: string): Promise<Response> {
  const filePath = join(PUBLIC_DIR, path === "/" ? "index.html" : path);

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404, headers: corsHeaders() });
  }

  return new Response(file, {
    headers: {
      "Content-Type": getContentType(filePath),
      ...corsHeaders(),
    },
  });
}

function analyzeProject(projectPath: string): AnalysisResult {
  const messages = getMessagesForProject(projectPath);
  const dbSessions = getSessionsForProject(projectPath);

  if (messages.length === 0) {
    return {
      projectPath,
      config: currentConfig,
      totalHours: 0,
      totalMinutes: 0,
      totalSessions: 0,
      totalMessages: 0,
      dateRange: { start: new Date(), end: new Date() },
      dailySummaries: [],
      sessions: [],
    };
  }

  const sessionGroups = groupMessagesIntoSessions(messages);
  const workSessions: WorkSession[] = [];
  const dailyMap = new Map<string, { minutes: number; sessions: number }>();

  for (const group of sessionGroups) {
    const startTime = new Date(group.messages[0].timestamp);
    const endTime = new Date(group.messages[group.messages.length - 1].timestamp);

    const dbSession = dbSessions.find((session) => session.sessionId === group.sessionId);
    const sessionDbId = dbSession?.id ?? insertSession({
      projectPath,
      sessionId: group.sessionId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      taskSummary: null,
      gitBranch: null,
      gitCommits: null,
    });

    const segments = computeTimeSegments(group.messages, sessionDbId, group.sessionId);

    const totalMinutes = segments
      .filter((seg) => seg.type !== "gap")
      .reduce((sum, seg) => sum + seg.durationMinutes, 0);
    const dateKey = startTime.toISOString().split("T")[0];

    const existing = dailyMap.get(dateKey) || { minutes: 0, sessions: 0 };
    dailyMap.set(dateKey, {
      minutes: existing.minutes + totalMinutes,
      sessions: existing.sessions + 1,
    });

    workSessions.push({
      id: String(sessionDbId),
      projectPath,
      sessionId: group.sessionId,
      startTime,
      endTime,
      taskSummary: dbSession?.taskSummary || "",
      gitBranch: dbSession?.gitBranch || "",
      segments,
    });
  }

  const dailySummaries: DailySummary[] = Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      totalMinutes: Math.round(data.minutes),
      sessionsCount: data.sessions,
    }))
    .sort((first, second) => first.date.localeCompare(second.date));

  const totalMinutes = dailySummaries.reduce((sum, day) => sum + day.totalMinutes, 0);
  const timestamps = messages.map((msg) => new Date(msg.timestamp).getTime());

  return {
    projectPath,
    config: currentConfig,
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    totalMinutes,
    totalSessions: workSessions.length,
    totalMessages: messages.length,
    dateRange: {
      start: new Date(Math.min(...timestamps)),
      end: new Date(Math.max(...timestamps)),
    },
    dailySummaries,
    sessions: workSessions,
  };
}

interface MessageGroup {
  sessionId: string;
  messages: Array<{ timestamp: string; type: string; toolCalls: string | null }>;
}

function groupMessagesIntoSessions(
  messages: Array<{ timestamp: string; sessionId: string; type: string; toolCalls: string | null }>
): MessageGroup[] {
  const groups = new Map<string, MessageGroup>();

  for (const msg of messages) {
    if (!groups.has(msg.sessionId)) {
      groups.set(msg.sessionId, { sessionId: msg.sessionId, messages: [] });
    }
    groups.get(msg.sessionId)!.messages.push({
      timestamp: msg.timestamp,
      type: msg.type,
      toolCalls: msg.toolCalls,
    });
  }

  return Array.from(groups.values());
}

function computeTimeSegments(
  messages: Array<{ timestamp: string; type: string; toolCalls: string | null }>,
  sessionDbId: number,
  sessionId: string
): TimeSegment[] {
  if (messages.length === 0) return [];

  const segments: TimeSegment[] = [];
  const gapThresholdMs = currentConfig.sessionGapThreshold * 60 * 1000;

  const userMessages = messages.filter((msg) => msg.type === "user");
  if (userMessages.length === 0) return [];

  let workSegmentStartIndex = 0;

  for (let userMsgIndex = 0; userMsgIndex < userMessages.length; userMsgIndex++) {
    const currentUserMsg = userMessages[userMsgIndex];
    const nextUserMsg = userMessages[userMsgIndex + 1];

    const currentTime = new Date(currentUserMsg.timestamp);
    const nextTime = nextUserMsg ? new Date(nextUserMsg.timestamp) : null;

    const isLastUserMessage = !nextUserMsg;
    const hasGap = nextTime && nextTime.getTime() - currentTime.getTime() > gapThresholdMs;

    if (isLastUserMessage || hasGap) {
      const workStart = new Date(userMessages[workSegmentStartIndex].timestamp);
      const workEnd = currentTime;

      const segmentMessages = messages.filter((msg) => {
        const msgTime = new Date(msg.timestamp);
        return msgTime >= workStart && msgTime <= workEnd;
      });

      let filesEdited = 0;
      let subagentsCount = 0;
      for (const msg of segmentMessages) {
        if (msg.toolCalls) {
          try {
            const tools = JSON.parse(msg.toolCalls) as Array<{ name: string }>;
            for (const tool of tools) {
              if (tool.name === "Edit" || tool.name === "Write") filesEdited++;
              if (tool.name === "Task") subagentsCount++;
            }
          } catch {
            // Skip malformed tool calls
          }
        }
      }

      const isComplex =
        filesEdited >= currentConfig.complexFileEditThreshold ||
        subagentsCount >= currentConfig.complexSubagentThreshold;
      const analysisTime = isComplex
        ? currentConfig.complexAnalysisMinutes
        : currentConfig.simpleAnalysisMinutes;

      const prepStart = new Date(workStart.getTime() - currentConfig.prepTimeMinutes * 60 * 1000);
      segments.push(createSegment(sessionId, segments.length, prepStart, workStart, "prep", currentConfig.prepTimeMinutes, filesEdited, subagentsCount));
      insertTimeSegment({ sessionId: sessionDbId, startTime: prepStart.toISOString(), endTime: workStart.toISOString(), type: "prep", durationMinutes: currentConfig.prepTimeMinutes, filesEdited: null, subagentsCount: 0 });

      const workDurationMinutes = Math.max(1, (workEnd.getTime() - workStart.getTime()) / (1000 * 60));
      segments.push(createSegment(sessionId, segments.length, workStart, workEnd, "work", workDurationMinutes, filesEdited, subagentsCount));
      insertTimeSegment({ sessionId: sessionDbId, startTime: workStart.toISOString(), endTime: workEnd.toISOString(), type: "work", durationMinutes: workDurationMinutes, filesEdited: null, subagentsCount });

      if (filesEdited > 0 || subagentsCount > 0) {
        const analysisEnd = new Date(workEnd.getTime() + analysisTime * 60 * 1000);
        segments.push(createSegment(sessionId, segments.length, workEnd, analysisEnd, "analysis", analysisTime, filesEdited, subagentsCount));
        insertTimeSegment({ sessionId: sessionDbId, startTime: workEnd.toISOString(), endTime: analysisEnd.toISOString(), type: "analysis", durationMinutes: analysisTime, filesEdited: null, subagentsCount: 0 });
      }

      if (nextUserMsg) {
        const gapStart = workEnd;
        const gapEnd = new Date(nextUserMsg.timestamp);
        const gapDuration = (gapEnd.getTime() - gapStart.getTime()) / (1000 * 60);
        segments.push(createSegment(sessionId, segments.length, gapStart, gapEnd, "gap", gapDuration, 0, 0));
        insertTimeSegment({ sessionId: sessionDbId, startTime: gapStart.toISOString(), endTime: gapEnd.toISOString(), type: "gap", durationMinutes: gapDuration, filesEdited: null, subagentsCount: 0 });

        workSegmentStartIndex = userMsgIndex + 1;
      }
    }
  }

  return segments;
}

function createSegment(
  sessionId: string,
  index: number,
  startTime: Date,
  endTime: Date,
  type: string,
  durationMinutes: number,
  filesEdited: number,
  subagentsCount: number
): TimeSegment {
  return {
    id: `${sessionId}-${index}`,
    sessionId,
    startTime,
    endTime,
    type,
    durationMinutes,
    filesEdited,
    subagentsCount,
  };
}

interface TimelineEvent {
  time: Date;
  type: string;
  description: string;
}

interface TimelineData {
  date: string;
  segments: TimeSegment[];
  events: TimelineEvent[];
}

function getTimelineForDate(projectPath: string, date: string): TimelineData {
  const analysis = analyzeProject(projectPath);
  const targetDate = new Date(date);
  const targetDateString = targetDate.toISOString().split("T")[0];

  const daySegments: TimeSegment[] = [];
  const dayEvents: TimelineEvent[] = [];

  for (const session of analysis.sessions) {
    const sessionDate = session.startTime.toISOString().split("T")[0];
    if (sessionDate === targetDateString) {
      daySegments.push(...session.segments);
      dayEvents.push({
        time: session.startTime,
        type: "session_start",
        description: `Session started: ${session.taskSummary || session.sessionId}`,
      });
      dayEvents.push({
        time: session.endTime,
        type: "session_end",
        description: "Session ended",
      });
    }
  }

  const dayMessages = getMessagesForProjectAndDate(projectPath, targetDateString);
  for (const msg of dayMessages) {
    const contentPreview = msg.content.substring(0, 50) + (msg.content.length > 50 ? "..." : "");
    dayEvents.push({
      time: new Date(msg.timestamp),
      type: msg.type,
      description: contentPreview,
    });
  }

  return {
    date: targetDateString,
    segments: daySegments,
    events: dayEvents.sort((first, second) => first.time.getTime() - second.time.getTime()),
  };
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;

  console.log(`${request.method} ${pathname}`);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (pathname === "/api/config") {
    if (request.method === "GET") {
      return jsonResponse(currentConfig);
    }

    if (request.method === "POST") {
      try {
        const body = (await request.json()) as Partial<TimeTrackingConfig>;
        currentConfig = { ...currentConfig, ...body };
        return jsonResponse(currentConfig);
      } catch {
        return errorResponse("Invalid JSON body");
      }
    }
  }

  if (pathname === "/api/analyze" && request.method === "GET") {
    const projectPath = searchParams.get("project");
    if (!projectPath) {
      return errorResponse("Missing 'project' query parameter");
    }

    try {
      const parseResult = await parseAndSaveMessages(projectPath);
      console.log(`Parsed ${parseResult.newMessages} new messages`);

      const result = analyzeProject(projectPath);
      return jsonResponse(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analysis failed";
      return errorResponse(message, 500);
    }
  }

  if (pathname === "/api/summarize" && request.method === "POST") {
    const projectPath = searchParams.get("project");
    if (!projectPath) {
      return errorResponse("Missing 'project' query parameter");
    }

    try {
      const summarized = await summarizeAllUnsummarized(projectPath);
      return jsonResponse({ summarized });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Summarization failed";
      return errorResponse(message, 500);
    }
  }

  if (pathname === "/api/timeline" && request.method === "GET") {
    const projectPath = searchParams.get("project");
    const date = searchParams.get("date");

    if (!projectPath) {
      return errorResponse("Missing 'project' query parameter");
    }
    if (!date) {
      return errorResponse("Missing 'date' query parameter (format: YYYY-MM-DD)");
    }

    try {
      const timeline = getTimelineForDate(projectPath, date);
      return jsonResponse(timeline);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Timeline fetch failed";
      return errorResponse(message, 500);
    }
  }

  if (!pathname.startsWith("/api/")) {
    return serveStaticFile(pathname);
  }

  return errorResponse("Not Found", 404);
}

export function startServer(port?: number): void {
  const serverPort = port ?? (Number(process.env.PORT) || DEFAULT_PORT);

  Bun.serve({
    port: serverPort,
    fetch: handleRequest,
  });

  console.log(`Server running at http://localhost:${serverPort}`);
}

if (import.meta.main) {
  startServer();
}
