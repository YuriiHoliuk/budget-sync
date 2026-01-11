/**
 * Job Base Class
 *
 * Abstract base class for Cloud Run jobs. Handles:
 * - Logging lifecycle events (start, complete, fail)
 * - Exit code management
 * - Error handling
 *
 * Subclasses implement:
 * - execute(): The job's business logic
 * - toJobResult(): Convert execution result to JobResult with exit code
 */

import type { Logger } from '../../modules/logging/index.ts';

export interface JobResult {
  success: boolean;
  exitCode: number;
  summary?: Record<string, unknown>;
}

/**
 * Subclasses must:
 * - Use @injectable() decorator
 * - Inject logger via @inject(LOGGER_TOKEN) in constructor
 */
export abstract class Job<TResult = void> {
  protected abstract logger: Logger;

  /**
   * Execute the job. Subclasses implement business logic here.
   */
  abstract execute(): Promise<TResult>;

  /**
   * Convert execution result to job result with exit code.
   * Override to customize exit code logic.
   */
  protected toJobResult(result: TResult): JobResult {
    return {
      success: true,
      exitCode: 0,
      summary: result as Record<string, unknown>,
    };
  }

  /**
   * Called by job runner. Handles logging and exit codes.
   */
  async run(): Promise<never> {
    const jobName = this.constructor.name;
    this.logger.info(`Starting ${jobName}`);

    try {
      const result = await this.execute();
      const jobResult = this.toJobResult(result);

      this.logger.info(`${jobName} completed`, jobResult.summary);
      process.exit(jobResult.exitCode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`${jobName} failed`, { error: message });
      process.exit(1);
    }
  }
}
