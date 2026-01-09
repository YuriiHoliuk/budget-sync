import { $ } from "bun";
import type { ParsedMessage } from "./types";
import {
  getSessionsForProject,
  getMessagesForProject,
  updateSessionSummary,
} from "./database";

const MAX_USER_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 500;
const RATE_LIMIT_DELAY_MS = 1000;

function formatDateForGit(date: Date): string {
  return date.toISOString();
}

function truncateMessage(message: string, maxLength: number): string {
  if (message.length <= maxLength) return message;
  return `${message.slice(0, maxLength)}...`;
}

function extractUserMessageContext(messages: ParsedMessage[]): string {
  const userMessages = messages
    .filter((msg) => msg.type === "user")
    .slice(0, MAX_USER_MESSAGES)
    .map((msg) => truncateMessage(msg.content, MAX_MESSAGE_LENGTH));

  if (userMessages.length === 0) {
    return "No user messages found.";
  }

  return userMessages.map((msg, index) => `${index + 1}. ${msg}`).join("\n");
}

async function getGitCommitsInRange(
  projectPath: string,
  startTime: Date,
  endTime: Date
): Promise<string> {
  try {
    const afterDate = formatDateForGit(startTime);
    const beforeDate = formatDateForGit(endTime);

    const result =
      await $`git -C ${projectPath} log --oneline --after="${afterDate}" --before="${beforeDate}"`.quiet();
    const commits = result.text().trim();

    return commits || "No commits in this time range.";
  } catch {
    return "Unable to retrieve git commits.";
  }
}

function buildSummarizationPrompt(
  userMessages: string,
  gitCommits: string
): string {
  return `Based on the following user messages and git commits from a coding session, summarize in 1-2 sentences what task or feature was being worked on. Be specific and concise.

USER MESSAGES:
${userMessages}

GIT COMMITS:
${gitCommits}

Provide only the summary, no additional explanation.`;
}

async function callClaudeForSummary(prompt: string): Promise<string> {
  try {
    const escapedPrompt = prompt.replace(/"/g, '\\"');
    const result = await $`claude --model haiku -p "${escapedPrompt}"`.quiet();
    const output = result.text().trim();

    if (!output) {
      return "Unable to summarize";
    }

    return output;
  } catch {
    return "Unable to summarize";
  }
}

export async function summarizeSession(
  sessionId: number,
  messages: ParsedMessage[],
  startTime: Date,
  endTime: Date,
  projectPath: string
): Promise<string> {
  const userMessageContext = extractUserMessageContext(messages);
  const gitCommits = await getGitCommitsInRange(
    projectPath,
    startTime,
    endTime
  );

  const prompt = buildSummarizationPrompt(userMessageContext, gitCommits);
  const summary = await callClaudeForSummary(prompt);

  updateSessionSummary(sessionId, summary);

  return summary;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function summarizeAllUnsummarized(
  projectPath: string
): Promise<number> {
  const sessions = getSessionsForProject(projectPath);
  const unsummarizedSessions = sessions.filter(
    (session) => !session.taskSummary
  );

  if (unsummarizedSessions.length === 0) {
    return 0;
  }

  const allMessages = getMessagesForProject(projectPath);
  let summarizedCount = 0;

  for (const session of unsummarizedSessions) {
    const sessionMessages = allMessages
      .filter((msg) => msg.sessionId === session.sessionId)
      .map(
        (msg): ParsedMessage => ({
          timestamp: new Date(msg.timestamp),
          type: msg.type,
          content: msg.content,
          sessionId: msg.sessionId,
          toolCalls: msg.toolCalls ? JSON.parse(msg.toolCalls) : [],
          uuid: msg.uuid,
        })
      );

    if (session.id === undefined) continue;

    const startTime = new Date(session.startTime);
    const endTime = new Date(session.endTime);

    await summarizeSession(
      session.id,
      sessionMessages,
      startTime,
      endTime,
      projectPath
    );

    summarizedCount++;

    if (summarizedCount < unsummarizedSessions.length) {
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }

  return summarizedCount;
}
