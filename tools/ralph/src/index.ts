#!/usr/bin/env bun

import { Command } from 'commander';
import { AVAILABLE_SCENARIOS } from './mock-claude.ts';
import { renderTui } from './tui/index.tsx';
import type { TuiConfig } from './tui/types.ts';

const program = new Command();

program
  .name('ralph')
  .description('Ralph Loop - Autonomous AI development loop for Claude Code (TUI mode)')
  .version('1.0.0')
  .option('-m, --max-iterations <number>', 'Maximum iterations before stopping', '200')
  .option('--model <model>', 'Claude model to use', 'opus')
  .option('-p, --prompt-file <file>', 'Prompt file to use', 'PROMPT.md')
  .option('-s, --exit-signal <signal>', 'Exit signal to watch for', 'RALPH_DONE')
  .option('--rate-limit-delay <ms>', 'Delay after rate limit in ms', '60000')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--cwd <dir>', 'Working directory for Claude process')
  .option('--mock', 'Use mock Claude for testing')
  .option('--mock-scenario <name>', `Mock scenario: ${AVAILABLE_SCENARIOS.join(', ')}`)
  .action(async (options) => {
    const config: TuiConfig = {
      maxIterations: Number.parseInt(options.maxIterations, 10),
      model: options.model,
      promptFile: options.promptFile,
      exitSignal: options.exitSignal,
      rateLimitDelay: Number.parseInt(options.rateLimitDelay, 10),
      verbose: options.verbose || false,
      cwd: options.cwd || process.cwd(),
      mockMode: options.mock || false,
      mockScenario: options.mockScenario,
    };

    await renderTui(config);
  });

program.parse();
