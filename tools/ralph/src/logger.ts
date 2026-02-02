import chalk from 'chalk';
import type { RalphConfig, RalphLogger } from './types.ts';

export function createLogger(verbose: boolean): RalphLogger {
  const timestamp = () =>
    chalk.gray(`[${new Date().toISOString().slice(11, 19)}]`);

  return {
    debug(message: string) {
      if (verbose) {
        console.log(`${timestamp()} ${chalk.gray('[DEBUG]')} ${message}`);
      }
    },

    info(message: string) {
      console.log(`${timestamp()} ${chalk.blue('[INFO]')} ${message}`);
    },

    warn(message: string) {
      console.log(`${timestamp()} ${chalk.yellow('[WARN]')} ${message}`);
    },

    error(message: string) {
      console.log(`${timestamp()} ${chalk.red('[ERROR]')} ${message}`);
    },

    success(message: string) {
      console.log(`${timestamp()} ${chalk.green('[OK]')} ${message}`);
    },

    claudeOutput(content: string) {
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.log(`${chalk.cyan('|')} ${line}`);
        }
      }
    },

    toolStart(name: string) {
      console.log(
        `${timestamp()} ${chalk.magenta('[TOOL]')} ${chalk.dim('Starting:')} ${name}`,
      );
    },

    toolEnd(name: string, isError: boolean) {
      const status = isError ? chalk.red('Failed') : chalk.green('Done');
      console.log(
        `${timestamp()} ${chalk.magenta('[TOOL]')} ${status}: ${name}`,
      );
    },

    iterationStart(iteration: number, maxIterations: number) {
      console.log('');
      console.log(chalk.blue('\u2501'.repeat(70)));
      console.log(
        chalk.green.bold(`  Iteration ${iteration} / ${maxIterations}`),
        chalk.gray(`- ${new Date().toLocaleString()}`),
      );
      console.log(chalk.blue('\u2501'.repeat(70)));
      console.log('');
    },

    iterationEnd(iteration: number, durationMs: number, exitCode: number) {
      const durationSec = (durationMs / 1000).toFixed(1);
      const status =
        exitCode === 0
          ? chalk.green('success')
          : chalk.yellow(`exit code ${exitCode}`);
      console.log('');
      console.log(
        chalk.gray(
          `  Iteration ${iteration} completed in ${durationSec}s (${status})`,
        ),
      );
    },

    banner(title: string, config: Partial<RalphConfig>) {
      console.log('');
      console.log(chalk.blue(`\u2554${'═'.repeat(68)}\u2557`));
      console.log(
        chalk.blue('\u2551') +
          chalk.white.bold(`  ${title.padEnd(66)}`) +
          chalk.blue('\u2551'),
      );
      console.log(chalk.blue(`\u2560${'═'.repeat(68)}\u2563`));

      if (config.promptFile) {
        console.log(
          chalk.blue('\u2551') +
            `  Prompt file:    ${chalk.green(config.promptFile)}`.padEnd(77) +
            chalk.blue('\u2551'),
        );
      }
      if (config.model) {
        console.log(
          chalk.blue('\u2551') +
            `  Model:          ${chalk.green(config.model)}`.padEnd(77) +
            chalk.blue('\u2551'),
        );
      }
      if (config.maxIterations) {
        console.log(
          chalk.blue('\u2551') +
            `  Max iterations: ${chalk.green(String(config.maxIterations))}`.padEnd(77) +
            chalk.blue('\u2551'),
        );
      }
      if (config.exitSignal) {
        console.log(
          chalk.blue('\u2551') +
            `  Exit signal:    ${chalk.green(config.exitSignal)}`.padEnd(77) +
            chalk.blue('\u2551'),
        );
      }
      if (config.mockMode) {
        console.log(
          chalk.blue('\u2551') +
            `  ${chalk.yellow('MOCK MODE - Using simulated Claude responses')}`.padEnd(77) +
            chalk.blue('\u2551'),
        );
      }

      console.log(chalk.blue(`\u255A${'═'.repeat(68)}\u255D`));
      console.log('');
    },

    complete(iterations: number, totalDurationMs: number, reason: string) {
      const totalSec = (totalDurationMs / 1000).toFixed(1);
      const isSuccess = reason === 'Exit signal detected';
      const color = isSuccess ? chalk.green : chalk.yellow;

      console.log('');
      console.log(color(`\u2554${'═'.repeat(68)}\u2557`));
      console.log(
        color('\u2551') +
          color.bold(
            `  ${(isSuccess ? 'TASK COMPLETE' : 'LOOP ENDED').padEnd(66)}`,
          ) +
          color('\u2551'),
      );
      console.log(color(`\u2560${'═'.repeat(68)}\u2563`));
      console.log(
        color('\u2551') +
          `  Reason:           ${chalk.white(reason)}`.padEnd(77) +
          color('\u2551'),
      );
      console.log(
        color('\u2551') +
          `  Total iterations: ${chalk.white(String(iterations))}`.padEnd(77) +
          color('\u2551'),
      );
      console.log(
        color('\u2551') +
          `  Total duration:   ${chalk.white(`${totalSec}s`)}`.padEnd(77) +
          color('\u2551'),
      );
      console.log(color(`\u255A${'═'.repeat(68)}\u255D`));
      console.log('');
    },
  };
}
