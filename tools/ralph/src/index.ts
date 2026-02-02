#!/usr/bin/env bun

import { Command } from 'commander';
import { AVAILABLE_SCENARIOS } from './mock-claude.ts';
import { RalphLoop } from './ralph-loop.ts';

const program = new Command();

program
  .name('ralph')
  .description('Ralph Loop - Autonomous AI development loop for Claude Code')
  .version('1.0.0')
  .option(
    '-m, --max-iterations <number>',
    'Maximum iterations before stopping',
    '200',
  )
  .option('--model <model>', 'Claude model to use', 'opus')
  .option('-p, --prompt-file <file>', 'Prompt file to use', 'PROMPT.md')
  .option(
    '-s, --exit-signal <signal>',
    'Exit signal to watch for',
    'RALPH_EXIT_SIGNAL',
  )
  .option(
    '--rate-limit-delay <ms>',
    'Delay after rate limit in ms',
    '60000',
  )
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--mock', 'Use mock Claude for testing')
  .option(
    '--mock-scenario <name>',
    `Mock scenario to use: ${AVAILABLE_SCENARIOS.join(', ')}`,
  )
  .action(async (options) => {
    const ralph = new RalphLoop({
      maxIterations: Number.parseInt(options.maxIterations, 10),
      model: options.model,
      promptFile: options.promptFile,
      exitSignal: options.exitSignal,
      rateLimitDelay: Number.parseInt(options.rateLimitDelay, 10),
      verbose: options.verbose || false,
      mockMode: options.mock || false,
      mockScenario: options.mockScenario,
    });

    await ralph.run();
  });

program.parse();
