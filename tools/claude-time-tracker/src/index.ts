#!/usr/bin/env bun
import { initDatabase } from "./database";
import { parseAndSaveMessages } from "./parser";
import { analyzeProject } from "./analyzer";
import { summarizeAllUnsummarized } from "./summarizer";
import { startServer } from "./server";
import { DEFAULT_CONFIG } from "./config";

const DEFAULT_PORT = 3847;

interface CliArgs {
  serve: boolean;
  parse: boolean;
  analyze: boolean;
  summarize: boolean;
  project: string;
  port: number;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    serve: false,
    parse: false,
    analyze: false,
    summarize: false,
    project: process.cwd(),
    port: DEFAULT_PORT,
    help: false,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    switch (arg) {
      case "--serve":
      case "-s":
        result.serve = true;
        break;
      case "--parse":
      case "-p":
        result.parse = true;
        break;
      case "--analyze":
      case "-a":
        result.analyze = true;
        break;
      case "--summarize":
        result.summarize = true;
        break;
      case "--project":
        result.project = args[++index] || process.cwd();
        break;
      case "--port":
        result.port = Number.parseInt(args[++index], 10) || DEFAULT_PORT;
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Claude Time Tracker - Track time spent on Claude Code sessions

USAGE:
  bun tools/claude-time-tracker/src/index.ts [OPTIONS]

OPTIONS:
  -s, --serve           Start web server
  -p, --parse           Parse conversations and save to database
  -a, --analyze         Run analysis and print summary
      --summarize       Run task summarization for unsummarized sessions
      --project <path>  Project path (default: current directory)
      --port <number>   Server port (default: ${DEFAULT_PORT})
  -h, --help            Show this help message

EXAMPLES:
  # Run all (parse + analyze + serve) - default behavior
  bun tools/claude-time-tracker/src/index.ts

  # Start only the web server
  bun tools/claude-time-tracker/src/index.ts --serve

  # Parse conversations for a specific project
  bun tools/claude-time-tracker/src/index.ts --parse --project /path/to/project

  # Analyze and print summary
  bun tools/claude-time-tracker/src/index.ts --analyze

  # Summarize unsummarized sessions with LLM
  bun tools/claude-time-tracker/src/index.ts --summarize
`);
}

function printHeader(): void {
  console.log("\n========================================");
  console.log("  Claude Time Tracker");
  console.log("========================================\n");
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

async function runParse(projectPath: string): Promise<number> {
  console.log(`[Parse] Scanning conversations for: ${projectPath}`);

  try {
    const result = await parseAndSaveMessages(projectPath);
    console.log(`[Parse] Found ${result.newMessages} new messages`);
    if (result.lastTimestamp) {
      console.log(`[Parse] Latest message: ${result.lastTimestamp}`);
    }
    return result.newMessages;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Parse] Error: ${message}`);
    return 0;
  }
}

async function runAnalyze(projectPath: string): Promise<void> {
  console.log(`[Analyze] Analyzing project: ${projectPath}\n`);

  try {
    const result = await analyzeProject(projectPath, DEFAULT_CONFIG);

    console.log("--- Summary ---");
    console.log(`  Total Time:     ${formatDuration(result.totalMinutes)} (${result.totalHours} hours)`);
    console.log(`  Sessions:       ${result.totalSessions}`);
    console.log(`  Messages:       ${result.totalMessages}`);
    console.log(`  Date Range:     ${result.dateRange.start.toLocaleDateString()} - ${result.dateRange.end.toLocaleDateString()}`);

    if (result.dailySummaries.length > 0) {
      console.log("\n--- Daily Breakdown ---");
      for (const day of result.dailySummaries) {
        console.log(`  ${day.date}: ${formatDuration(day.totalMinutes)} (${day.sessionsCount} sessions)`);
      }
    }

    if (result.sessions.length > 0) {
      console.log("\n--- Recent Sessions ---");
      const recentSessions = result.sessions.slice(-5);
      for (const session of recentSessions) {
        const duration = session.segments.reduce((sum, seg) => sum + seg.durationMinutes, 0);
        const summary = session.taskSummary || "(no summary)";
        console.log(`  ${session.startTime.toLocaleDateString()} ${session.startTime.toLocaleTimeString()} - ${formatDuration(duration)}`);
        console.log(`    ${summary}`);
      }
    }

    console.log("");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Analyze] Error: ${message}`);
  }
}

async function runSummarize(projectPath: string): Promise<number> {
  console.log(`[Summarize] Generating summaries for: ${projectPath}`);

  try {
    const count = await summarizeAllUnsummarized(projectPath);
    console.log(`[Summarize] Summarized ${count} sessions`);
    return count;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Summarize] Error: ${message}`);
    return 0;
  }
}

function runServe(port: number): void {
  console.log(`[Server] Starting web server on port ${port}...`);
  startServer(port);
  console.log(`[Server] Dashboard available at: http://localhost:${port}`);
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  printHeader();

  // Initialize database
  console.log("[Init] Initializing database...");
  initDatabase();
  console.log("[Init] Database ready\n");

  const hasExplicitCommand = args.serve || args.parse || args.analyze || args.summarize;

  if (!hasExplicitCommand) {
    // Default: parse + analyze + serve
    await runParse(args.project);
    console.log("");
    await runAnalyze(args.project);
    runServe(args.port);
  } else {
    // Run explicit commands
    if (args.parse) {
      await runParse(args.project);
      console.log("");
    }

    if (args.summarize) {
      await runSummarize(args.project);
      console.log("");
    }

    if (args.analyze) {
      await runAnalyze(args.project);
    }

    if (args.serve) {
      runServe(args.port);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
