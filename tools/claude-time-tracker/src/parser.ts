import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { getLastParseState, updateParseState, insertMessage } from "./database";
import type { ToolCall, ParsedMessage } from "./types";

const PROJECTS_DIR = path.join(process.env.HOME || "~", ".claude", "projects");

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface ConversationMessage {
  uuid: string;
  timestamp: string;
  type: string;
  sessionId?: string;
  isMeta?: boolean;
  message?: { content: string | ContentBlock[] };
}

export function getProjectConversationsDir(projectPath: string): string {
  const folderName = projectPath.replace(/\//g, "-");
  return path.join(PROJECTS_DIR, folderName);
}

export async function parseAndSaveMessages(projectPath: string): Promise<{ newMessages: number; lastTimestamp: string }> {
  const state = getLastParseState(projectPath);
  const lastTimestamp = state?.lastMessageTimestamp || null;

  const dir = getProjectConversationsDir(projectPath);
  if (!fs.existsSync(dir)) {
    throw new Error(`Project directory not found: ${dir}`);
  }

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl") && !f.startsWith("agent-"))
    .map((f) => path.join(dir, f));

  let newMessages = 0;
  let latestTimestamp = lastTimestamp || "";

  for (const file of files) {
    const sessionId = path.basename(file, ".jsonl");
    const messages = await parseFile(file, lastTimestamp, sessionId);

    for (const msg of messages) {
      insertMessage({
        projectPath,
        sessionId: msg.sessionId,
        uuid: msg.uuid,
        timestamp: msg.timestamp.toISOString(),
        type: msg.type as "user" | "assistant",
        content: msg.content,
        toolCalls: msg.toolCalls.length ? JSON.stringify(msg.toolCalls) : null,
      });
      newMessages++;
      if (msg.timestamp.toISOString() > latestTimestamp) {
        latestTimestamp = msg.timestamp.toISOString();
      }
    }
  }

  if (latestTimestamp) {
    updateParseState(projectPath, latestTimestamp);
  }

  return { newMessages, lastTimestamp: latestTimestamp };
}

async function parseFile(filePath: string, afterTimestamp: string | null, sessionId: string): Promise<ParsedMessage[]> {
  const messages: ParsedMessage[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Number.POSITIVE_INFINITY });

  let isFirstUserMessage = true;
  let isPrintMode = false;

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line) as ConversationMessage;
      if (data.type !== "user" && data.type !== "assistant") continue;
      if (data.isMeta || !data.message) continue;
      if (afterTimestamp && data.timestamp <= afterTimestamp) continue;

      const content = extractContent(data.message.content);
      if (data.type === "user" && isSystemCommand(content)) continue;

      // Check first user message to detect print mode sessions
      if (data.type === "user" && isFirstUserMessage) {
        isFirstUserMessage = false;
        if (isPrintModeSession(content)) {
          isPrintMode = true;
          break; // Skip entire session
        }
      }

      messages.push({
        timestamp: new Date(data.timestamp),
        type: data.type,
        content,
        sessionId: data.sessionId || sessionId,
        toolCalls: extractToolCalls(data.message.content),
        uuid: data.uuid,
      });
    } catch {
      // Skip malformed lines
    }
  }

  // Return empty if print mode session
  if (isPrintMode) {
    return [];
  }

  return messages;
}

function extractContent(content: string | ContentBlock[] | undefined): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b.type === "text" || b.type === "thinking")
    .map((b) => b.text || b.thinking || "")
    .join("\n");
}

function extractToolCalls(content: string | ContentBlock[] | undefined): ToolCall[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((b) => b.type === "tool_use" && b.name && b.input)
    .map((b) => ({ name: b.name!, input: b.input! }));
}

function isSystemCommand(content: string): boolean {
  const commands = ["/clear", "/help", "/exit", "/quit"];
  const trimmed = content.trim().toLowerCase();
  return commands.some((c) => trimmed === c || trimmed.startsWith(`${c} `));
}

function isPrintModeSession(content: string): boolean {
  // Sessions created via `claude -p` (print mode) should be excluded
  // These are typically automated calls like summarization requests
  const printModePatterns = [
    "Based on the following user messages and git commits from a coding session",
  ];
  return printModePatterns.some((pattern) => content.startsWith(pattern));
}
