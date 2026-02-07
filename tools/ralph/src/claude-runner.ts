import { type ChildProcess, spawn } from 'node:child_process';
import type { ClaudeRunResult, ClaudeStreamEvent, RalphLogger } from './types.ts';

export interface ClaudeProcessEvents {
  onOutput: (content: string) => void;
  onToolStart: (name: string) => void;
  onToolEnd: (name: string, isError: boolean) => void;
  onResult: (result: ClaudeRunResult) => void;
  onTokens: (input: number, output: number) => void;
  onTurnComplete: () => void;
}

export interface ClaudeProcessHandle {
  write: (input: string) => void;
  kill: () => void;
  isRunning: () => boolean;
}

const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'rate_limit',
  'too many requests',
  '429',
  'overloaded',
  'capacity',
];

export interface ClaudeRunnerOptions {
  model: string;
  prompt: string;
  logger: RalphLogger;
  onOutput?: (content: string) => void;
  /** Kill process if no activity for this long (default: 5 min) */
  stallTimeout?: number;
  /** Working directory for the Claude process */
  cwd?: string;
}

export async function runClaude(
  options: ClaudeRunnerOptions,
): Promise<ClaudeRunResult> {
  const {
    model,
    prompt,
    logger,
    onOutput,
    stallTimeout = 300000,
    cwd,
  } = options;

  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = '';
    let currentToolName = '';
    let lastActivityTime = Date.now();
    let cost = 0;

    const args = [
      '--dangerously-skip-permissions',
      '--model',
      model,
      '--no-session-persistence',
      '--output-format',
      'stream-json',
      '--verbose',
      '-p',
      prompt,
    ];

    logger.debug(`Spawning: claude ${args.join(' ')}`);

    let child: ChildProcess;
    try {
      child = spawn('claude', args, {
        stdio: ['inherit', 'pipe', 'pipe'],
        env: { ...process.env },
        cwd,
      });
    } catch (spawnError) {
      const errorMessage =
        spawnError instanceof Error
          ? spawnError.message
          : String(spawnError);
      return resolve({
        success: false,
        output: '',
        exitCode: 1,
        error: `Failed to spawn Claude: ${errorMessage}`,
        isRateLimited: false,
      });
    }

    const stallChecker = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityTime;
      if (timeSinceActivity > stallTimeout) {
        logger.warn(
          `No activity for ${Math.round(timeSinceActivity / 1000)}s - process appears stalled, killing`,
        );
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      } else if (timeSinceActivity > 60000) {
        logger.info(
          `Waiting... (${Math.round(timeSinceActivity / 1000)}s since last activity)`,
        );
      }
    }, 30000);

    const processStreamEvent = (event: ClaudeStreamEvent) => {
      lastActivityTime = Date.now();

      switch (event.type) {
        case 'system':
          if (event.subtype === 'init') {
            logger.debug(`Session initialized: ${event.session_id}`);
          }
          break;

        case 'assistant':
          if (event.message?.content) {
            const content = event.message.content;
            if (Array.isArray(content)) {
              for (const item of content) {
                if (item.type === 'text' && item.text) {
                  output += item.text;
                  logger.claudeOutput(item.text);
                  onOutput?.(item.text);
                }
              }
            } else if (typeof content === 'string') {
              output += content;
              logger.claudeOutput(content);
              onOutput?.(content);
            }
          }
          break;

        case 'tool_use':
          if (event.tool_use?.name) {
            currentToolName = event.tool_use.name;
            logger.toolStart(currentToolName);
          }
          break;

        case 'tool_result':
          if (currentToolName) {
            const isError =
              typeof event.result === 'object' &&
              event.result !== null &&
              'is_error' in event.result &&
              event.result.is_error;
            logger.toolEnd(currentToolName, Boolean(isError));
            currentToolName = '';
          }
          break;

        case 'result':
          if (event.total_cost_usd !== undefined) {
            cost = event.total_cost_usd;
          }
          if (event.subtype === 'success') {
            logger.debug(`Completed successfully, cost: $${cost.toFixed(4)}`);
            if (
              event.result &&
              typeof event.result === 'string' &&
              !output.includes(event.result)
            ) {
              output += event.result;
            }
          } else if (event.subtype === 'error') {
            const errorMsg =
              typeof event.result === 'string'
                ? event.result
                : 'Unknown error';
            logger.error(`Claude returned error: ${errorMsg}`);
          }
          break;
      }
    };

    let buffer = '';

    child.stdout?.on('data', (data: Buffer) => {
      lastActivityTime = Date.now();
      buffer += data.toString();

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const event = JSON.parse(line) as ClaudeStreamEvent;
          processStreamEvent(event);
        } catch {
          if (line.trim()) {
            logger.debug(`Non-JSON output: ${line}`);
            output += `${line}\n`;
            logger.claudeOutput(line);
            onOutput?.(line);
          }
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      lastActivityTime = Date.now();
      const text = data.toString();
      logger.warn(`stderr: ${text}`);

      const lowerText = text.toLowerCase();
      const isRateLimited = RATE_LIMIT_PATTERNS.some((pattern) =>
        lowerText.includes(pattern),
      );
      if (isRateLimited) {
        logger.warn('Rate limiting detected');
      }
    });

    child.on('error', (processError: Error) => {
      clearInterval(stallChecker);
      logger.error(`Process error: ${processError.message}`);
      resolve({
        success: false,
        output,
        exitCode: 1,
        error: processError.message,
        isRateLimited: false,
        cost,
        durationMs: Date.now() - startTime,
      });
    });

    child.on('close', (code: number | null) => {
      clearInterval(stallChecker);

      const exitCode = code ?? 1;
      const durationMs = Date.now() - startTime;

      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer) as ClaudeStreamEvent;
          processStreamEvent(event);
        } catch {
          output += buffer;
          logger.claudeOutput(buffer);
        }
      }

      const lowerOutput = output.toLowerCase();
      const isRateLimited = RATE_LIMIT_PATTERNS.some((pattern) =>
        lowerOutput.includes(pattern),
      );

      resolve({
        success: exitCode === 0,
        output,
        exitCode,
        isRateLimited,
        cost,
        durationMs,
      });
    });
  });
}

export interface InteractiveClaudeOptions {
  model: string;
  initialPrompt: string;
  logger: RalphLogger;
  stallTimeout?: number;
  cwd?: string;
  events: Partial<ClaudeProcessEvents>;
}

export function createInteractiveClaudeProcess(
  options: InteractiveClaudeOptions,
): ClaudeProcessHandle {
  const {
    model,
    initialPrompt,
    logger,
    stallTimeout = 300000,
    cwd,
    events,
  } = options;

  const startTime = Date.now();
  let output = '';
  let currentToolName = '';
  let lastActivityTime = Date.now();
  let cost = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  // Use streaming input/output for interactive messaging
  const args = [
    '--dangerously-skip-permissions',
    '--model',
    model,
    '--output-format',
    'stream-json',
    '--input-format',
    'stream-json',
    '--verbose',
  ];

  logger.debug(`Spawning interactive: claude ${args.join(' ')}`);

  const child = spawn('claude', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    cwd,
  });

  // Send the initial prompt as a user message (format: {type: "user", message: {role: "user", content: "..."}})
  const initialMessage = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: initialPrompt },
  });
  child.stdin?.write(`${initialMessage}\n`);
  logger.debug(`Sent initial prompt: ${initialPrompt.slice(0, 100)}...`);

  const stallChecker = setInterval(() => {
    const timeSinceActivity = Date.now() - lastActivityTime;
    if (timeSinceActivity > stallTimeout) {
      logger.warn(
        `No activity for ${Math.round(timeSinceActivity / 1000)}s - process appears stalled, killing`,
      );
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    } else if (timeSinceActivity > 60000) {
      logger.info(
        `Waiting... (${Math.round(timeSinceActivity / 1000)}s since last activity)`,
      );
    }
  }, 30000);

  // Helper to extract usage from any event that might contain it
  const extractUsage = (event: ClaudeStreamEvent) => {
    const eventWithUsage = event as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
    const usage = eventWithUsage.usage;
    if (usage && usage.input_tokens !== undefined && usage.output_tokens !== undefined) {
      inputTokens = usage.input_tokens + (usage.cache_read_input_tokens ?? 0);
      outputTokens = usage.output_tokens;
      events.onTokens?.(inputTokens, outputTokens);
      logger.debug(`[TOKENS] input=${inputTokens}, output=${outputTokens}`);
    }
    // Also check for cost in the event
    const eventWithCost = event as { cost_usd?: number; total_cost_usd?: number };
    const costUsd = eventWithCost.cost_usd ?? eventWithCost.total_cost_usd;
    if (costUsd !== undefined && costUsd > cost) {
      cost = costUsd;
      logger.debug(`[COST] $${cost.toFixed(4)}`);
    }
  };

  const processStreamEvent = (event: ClaudeStreamEvent) => {
    lastActivityTime = Date.now();

    // Log all events in verbose mode to debug streaming usage
    if (event.type !== 'assistant') {
      logger.debug(`[EVENT] ${event.type}: ${JSON.stringify(event).slice(0, 300)}`);
    }

    // Check for usage in any event type
    extractUsage(event);

    switch (event.type) {
      case 'system':
        if (event.subtype === 'init') {
          logger.debug(`Session initialized: ${event.session_id}`);
        }
        break;

      case 'assistant':
        if (event.message?.content) {
          const content = event.message.content;
          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'text' && item.text) {
                output += item.text;
                logger.claudeOutput(item.text);
                events.onOutput?.(item.text);
              }
            }
          } else if (typeof content === 'string') {
            output += content;
            logger.claudeOutput(content);
            events.onOutput?.(content);
          }
          // Estimate tokens from output length (~4 chars per token)
          // This is a rough approximation until we get real usage data
          if (outputTokens === 0) {
            const estimatedOutputTokens = Math.round(output.length / 4);
            events.onTokens?.(inputTokens, estimatedOutputTokens);
          }
        }
        break;

      case 'tool_use':
        if (event.tool_use?.name) {
          currentToolName = event.tool_use.name;
          logger.toolStart(currentToolName);
          events.onToolStart?.(currentToolName);
        }
        break;

      case 'tool_result':
        if (currentToolName) {
          const isError =
            typeof event.result === 'object' &&
            event.result !== null &&
            'is_error' in event.result &&
            event.result.is_error;
          logger.toolEnd(currentToolName, Boolean(isError));
          events.onToolEnd?.(currentToolName, Boolean(isError));
          currentToolName = '';
        }
        break;

      case 'usage':
        logger.debug(`[USAGE EVENT] ${JSON.stringify(event)}`);
        // Tokens can be at top level or nested in usage object
        if ('input_tokens' in event && 'output_tokens' in event) {
          inputTokens = (event as { input_tokens: number }).input_tokens;
          outputTokens = (event as { output_tokens: number }).output_tokens;
          events.onTokens?.(inputTokens, outputTokens);
        }
        break;

      case 'result':
        logger.debug(`[RESULT EVENT] ${JSON.stringify(event)}`);
        if (event.total_cost_usd !== undefined) {
          cost = event.total_cost_usd;
        }
        // Extract tokens from result event if present
        if ('input_tokens' in event && 'output_tokens' in event) {
          inputTokens = (event as { input_tokens: number }).input_tokens;
          outputTokens = (event as { output_tokens: number }).output_tokens;
          events.onTokens?.(inputTokens, outputTokens);
        }
        if (event.subtype === 'success') {
          logger.debug(`Turn completed successfully, cost: $${cost.toFixed(4)}`);
          events.onTurnComplete?.();
          if (
            event.result &&
            typeof event.result === 'string' &&
            !output.includes(event.result)
          ) {
            output += event.result;
          }
        } else if (event.subtype === 'error') {
          const errorMsg =
            typeof event.result === 'string' ? event.result : 'Unknown error';
          logger.error(`Claude returned error: ${errorMsg}`);
        }
        break;

      default:
        // Log unknown event types to help debug
        if (event.type) {
          logger.debug(`[UNKNOWN EVENT] type=${event.type}: ${JSON.stringify(event).slice(0, 200)}`);
        }
    }
  };

  let buffer = '';

  child.stdout?.on('data', (data: Buffer) => {
    lastActivityTime = Date.now();
    buffer += data.toString();

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line) as ClaudeStreamEvent;
        processStreamEvent(event);
      } catch {
        if (line.trim()) {
          logger.debug(`Non-JSON output: ${line}`);
          output += `${line}\n`;
          logger.claudeOutput(line);
          events.onOutput?.(line);
        }
      }
    }
  });

  child.stderr?.on('data', (data: Buffer) => {
    lastActivityTime = Date.now();
    const text = data.toString();
    logger.warn(`stderr: ${text}`);

    const lowerText = text.toLowerCase();
    const isRateLimited = RATE_LIMIT_PATTERNS.some((pattern) =>
      lowerText.includes(pattern),
    );
    if (isRateLimited) {
      logger.warn('Rate limiting detected');
    }
  });

  child.on('error', (processError: Error) => {
    clearInterval(stallChecker);
    logger.error(`Process error: ${processError.message}`);
    events.onResult?.({
      success: false,
      output,
      exitCode: 1,
      error: processError.message,
      isRateLimited: false,
      cost,
      durationMs: Date.now() - startTime,
    });
  });

  child.on('close', (code: number | null) => {
    clearInterval(stallChecker);

    const exitCode = code ?? 1;
    const durationMs = Date.now() - startTime;

    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer) as ClaudeStreamEvent;
        processStreamEvent(event);
      } catch {
        output += buffer;
        logger.claudeOutput(buffer);
      }
    }

    const lowerOutput = output.toLowerCase();
    const isRateLimited = RATE_LIMIT_PATTERNS.some((pattern) =>
      lowerOutput.includes(pattern),
    );

    events.onResult?.({
      success: exitCode === 0,
      output,
      exitCode,
      isRateLimited,
      cost,
      durationMs,
      inputTokens,
      outputTokens,
    });
  });

  return {
    write: (input: string) => {
      if (child.stdin && !child.killed) {
        // Send user message in stream-json format
        const message = JSON.stringify({
          type: 'user',
          message: { role: 'user', content: input },
        });
        child.stdin.write(`${message}\n`);
        logger.debug(`Sent user message: ${input.slice(0, 100)}${input.length > 100 ? '...' : ''}`);
      }
    },
    kill: () => {
      clearInterval(stallChecker);
      child.kill('SIGTERM');
    },
    isRunning: () => !child.killed && child.exitCode === null,
  };
}
