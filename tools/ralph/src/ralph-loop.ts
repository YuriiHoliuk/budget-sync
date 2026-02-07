import * as fs from 'node:fs';
import { runClaude } from './claude-runner.ts';
import { createLogger } from './logger.ts';
import { runMockClaude, setMockScenario } from './mock-claude.ts';
import type {
  ClaudeRunResult,
  IterationResult,
  RalphConfig,
  RalphLogger,
} from './types.ts';

export interface RalphOptions extends Partial<RalphConfig> {
  mockScenario?: string;
}

const DEFAULT_CONFIG: RalphConfig = {
  maxIterations: 200,
  model: 'opus',
  promptFile: 'PROMPT.md',
  exitSignal: 'RALPH_DONE',
  rateLimitDelay: 60000,
  verbose: false,
  mockMode: false,
  cwd: process.cwd(),
};

export class RalphLoop {
  private config: RalphConfig;
  private logger: RalphLogger;
  private isRunning = false;
  private shouldStop = false;
  private currentIteration = 0;
  private startTime = 0;

  constructor(options: RalphOptions = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.logger = createLogger(this.config.verbose);

    if (
      process.env.RALPH_MOCK_CLAUDE === 'true' ||
      options.mockMode
    ) {
      this.config.mockMode = true;
      if (options.mockScenario) {
        setMockScenario(options.mockScenario);
      }
    }
  }

  /**
   * Read the prompt file from disk.
   * Called every iteration so changes to the prompt file
   * are picked up without restarting the loop.
   */
  private loadPrompt(): string {
    if (!fs.existsSync(this.config.promptFile)) {
      throw new Error(
        `Prompt file not found: ${this.config.promptFile}\n` +
          "Create a PROMPT.md file with your command, e.g.: echo '/migrate_permission' > PROMPT.md",
      );
    }

    const prompt = fs.readFileSync(this.config.promptFile, 'utf-8').trim();
    if (!prompt) {
      throw new Error(
        `Prompt file is empty: ${this.config.promptFile}`,
      );
    }

    return prompt;
  }

  private async runIteration(): Promise<ClaudeRunResult> {
    if (this.config.mockMode) {
      return runMockClaude(this.logger);
    }

    const prompt = this.loadPrompt();

    return runClaude({
      model: this.config.model,
      prompt,
      logger: this.logger,
      cwd: this.config.cwd,
    });
  }

  private checkForExitSignal(output: string): boolean {
    return output.includes(this.config.exitSignal);
  }

  private async executeIteration(): Promise<IterationResult> {
    const iterationStart = Date.now();

    if (this.shouldStop) {
      return {
        iteration: this.currentIteration,
        result: {
          success: false,
          output: '',
          exitCode: 130,
          error: 'Interrupted',
        },
        durationMs: Date.now() - iterationStart,
        shouldExit: true,
        exitReason: 'user_interrupt',
      };
    }

    const result = await this.runIteration();
    const durationMs = Date.now() - iterationStart;

    if (this.checkForExitSignal(result.output)) {
      return {
        iteration: this.currentIteration,
        result,
        durationMs,
        shouldExit: true,
        exitReason: 'signal',
      };
    }

    if (result.isRateLimited) {
      this.logger.warn(
        `Rate limited. Waiting ${this.config.rateLimitDelay / 1000}s before next iteration...`,
      );
      await this.sleep(this.config.rateLimitDelay);
    }

    return {
      iteration: this.currentIteration,
      result,
      durationMs,
      shouldExit: false,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public stop(): void {
    this.shouldStop = true;
    this.logger.info(
      'Stop signal received, will stop after current iteration...',
    );
  }

  public async run(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Ralph loop is already running');
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.startTime = Date.now();
    this.currentIteration = 0;

    // Validate prompt file exists before starting
    try {
      this.loadPrompt();
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : String(loadError);
      this.logger.error(message);
      this.isRunning = false;
      process.exit(1);
    }

    this.logger.banner('Ralph Loop - Autonomous Claude', {
      promptFile: this.config.promptFile,
      model: this.config.model,
      maxIterations: this.config.maxIterations,
      exitSignal: this.config.exitSignal,
      mockMode: this.config.mockMode,
    });

    const signalHandler = () => {
      this.logger.info('\nReceived interrupt signal');
      if (this.shouldStop) {
        this.logger.warn('Force stopping...');
        process.exit(130);
      }
      this.stop();
    };

    process.on('SIGINT', signalHandler);
    process.on('SIGTERM', signalHandler);

    let exitReason = 'Unknown';

    try {
      while (
        this.currentIteration < this.config.maxIterations &&
        !this.shouldStop
      ) {
        this.currentIteration++;

        this.logger.iterationStart(
          this.currentIteration,
          this.config.maxIterations,
        );

        const iterResult = await this.executeIteration();

        this.logger.iterationEnd(
          this.currentIteration,
          iterResult.durationMs,
          iterResult.result.exitCode,
        );

        if (iterResult.shouldExit) {
          switch (iterResult.exitReason) {
            case 'signal':
              exitReason = 'Exit signal detected';
              break;
            case 'user_interrupt':
              exitReason = 'User interrupted';
              break;
            case 'error':
              exitReason = `Error: ${iterResult.result.error || 'Unknown error'}`;
              break;
            default:
              exitReason = iterResult.exitReason || 'Unknown';
          }
          break;
        }

        if (
          !this.shouldStop &&
          this.currentIteration < this.config.maxIterations
        ) {
          await this.sleep(2000);
        }
      }

      if (
        this.currentIteration >= this.config.maxIterations &&
        exitReason === 'Unknown'
      ) {
        exitReason = 'Max iterations reached';
      }
    } finally {
      process.removeListener('SIGINT', signalHandler);
      process.removeListener('SIGTERM', signalHandler);
      this.isRunning = false;
    }

    const totalDuration = Date.now() - this.startTime;
    this.logger.complete(this.currentIteration, totalDuration, exitReason);

    const exitCode = exitReason === 'Exit signal detected' ? 0 : 1;
    process.exit(exitCode);
  }
}
