import { Database } from "bun:sqlite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../data/timetracker.db");

const db = new Database(DB_PATH, { create: true });

// Types
export interface ParseState {
  lastParsedAt: string;
  lastMessageTimestamp: string | null;
}

export interface Message {
  id?: number;
  projectPath: string;
  sessionId: string;
  uuid: string;
  timestamp: string;
  type: "user" | "assistant";
  content: string;
  toolCalls: string | null;
}

export interface Session {
  id?: number;
  projectPath: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  taskSummary: string | null;
  gitBranch: string | null;
  gitCommits: string | null;
}

export interface TimeSegment {
  id?: number;
  sessionId: number;
  startTime: string;
  endTime: string;
  type: "prep" | "work" | "analysis" | "gap";
  durationMinutes: number;
  filesEdited: string | null;
  subagentsCount: number;
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS parse_state (
      project_path TEXT PRIMARY KEY,
      last_parsed_at TEXT NOT NULL,
      last_message_timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      session_id TEXT NOT NULL,
      uuid TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('user', 'assistant')),
      content TEXT NOT NULL,
      tool_calls TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      session_id TEXT NOT NULL UNIQUE,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      task_summary TEXT,
      git_branch TEXT,
      git_commits TEXT
    );

    CREATE TABLE IF NOT EXISTS time_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('prep', 'work', 'analysis', 'gap')),
      duration_minutes REAL NOT NULL,
      files_edited TEXT,
      subagents_count INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_path);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
    CREATE INDEX IF NOT EXISTS idx_time_segments_session ON time_segments(session_id);
  `);
}

export function getLastParseState(projectPath: string): ParseState | null {
  const row = db.query<{ last_parsed_at: string; last_message_timestamp: string | null }, [string]>(
    "SELECT last_parsed_at, last_message_timestamp FROM parse_state WHERE project_path = ?"
  ).get(projectPath);

  if (!row) return null;
  return { lastParsedAt: row.last_parsed_at, lastMessageTimestamp: row.last_message_timestamp };
}

export function updateParseState(projectPath: string, lastMessageTimestamp: string | null): void {
  db.query(
    `INSERT INTO parse_state (project_path, last_parsed_at, last_message_timestamp)
     VALUES (?, datetime('now'), ?)
     ON CONFLICT(project_path) DO UPDATE SET
       last_parsed_at = datetime('now'),
       last_message_timestamp = excluded.last_message_timestamp`
  ).run(projectPath, lastMessageTimestamp);
}

export function insertMessage(msg: Omit<Message, "id">): void {
  db.query(
    `INSERT INTO messages (project_path, session_id, uuid, timestamp, type, content, tool_calls)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(msg.projectPath, msg.sessionId, msg.uuid, msg.timestamp, msg.type, msg.content, msg.toolCalls);
}

export function insertSession(session: Omit<Session, "id">): number {
  const result = db.query(
    `INSERT INTO sessions (project_path, session_id, start_time, end_time, task_summary, git_branch, git_commits)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       task_summary = excluded.task_summary,
       git_branch = excluded.git_branch,
       git_commits = excluded.git_commits
     RETURNING id`
  ).get(session.projectPath, session.sessionId, session.startTime, session.endTime, session.taskSummary, session.gitBranch, session.gitCommits) as { id: number };

  return result.id;
}

export function insertTimeSegment(segment: Omit<TimeSegment, "id">): void {
  db.query(
    `INSERT INTO time_segments (session_id, start_time, end_time, type, duration_minutes, files_edited, subagents_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(segment.sessionId, segment.startTime, segment.endTime, segment.type, segment.durationMinutes, segment.filesEdited, segment.subagentsCount);
}

export function deleteSegmentsForSession(sessionId: number): void {
  db.query("DELETE FROM time_segments WHERE session_id = ?").run(sessionId);
}

export function getMessagesForProject(projectPath: string): Message[] {
  return db.query<Message, [string]>(
    `SELECT id, project_path as projectPath, session_id as sessionId, uuid, timestamp, type, content, tool_calls as toolCalls
     FROM messages WHERE project_path = ? ORDER BY timestamp`
  ).all(projectPath);
}

export function getSessionsForProject(projectPath: string): Session[] {
  return db.query<Session, [string]>(
    `SELECT id, project_path as projectPath, session_id as sessionId, start_time as startTime, end_time as endTime,
            task_summary as taskSummary, git_branch as gitBranch, git_commits as gitCommits
     FROM sessions WHERE project_path = ? ORDER BY start_time`
  ).all(projectPath);
}

export function getTimeSegmentsForSession(sessionId: number): TimeSegment[] {
  return db.query<TimeSegment, [number]>(
    `SELECT id, session_id as sessionId, start_time as startTime, end_time as endTime, type,
            duration_minutes as durationMinutes, files_edited as filesEdited, subagents_count as subagentsCount
     FROM time_segments WHERE session_id = ? ORDER BY start_time`
  ).all(sessionId);
}

export function updateSessionSummary(sessionId: number, summary: string): void {
  db.query("UPDATE sessions SET task_summary = ? WHERE id = ?").run(summary, sessionId);
}

export function getMessagesForProjectAndDate(projectPath: string, date: string): Message[] {
  return db.query<Message, [string, string, string]>(
    `SELECT id, project_path as projectPath, session_id as sessionId, uuid, timestamp, type, content, tool_calls as toolCalls
     FROM messages
     WHERE project_path = ? AND timestamp >= ? AND timestamp < date(?, '+1 day')
     ORDER BY timestamp`
  ).all(projectPath, date, date);
}
