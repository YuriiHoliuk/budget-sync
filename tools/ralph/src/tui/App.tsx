import { useState, useCallback, useEffect, useRef } from 'react';
import { Box, useApp, useInput } from 'ink';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LogPane } from './components/LogPane.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { InputBox } from './components/InputBox.tsx';
import { useLogs } from './hooks/useLogs.ts';
import { useClaudeProcess } from './hooks/useClaudeProcess.ts';
import type { TuiConfig, TuiState } from './types.ts';
import type { RalphLogger } from '../types.ts';

interface AppProps {
  config: TuiConfig;
}

export function App({ config }: AppProps) {
  const { exit } = useApp();
  const { completedLogs, currentLogs, addLog, markIterationComplete } =
    useLogs();

  const [state, setState] = useState<TuiState>({
    logs: [],
    currentIteration: 1,
    maxIterations: config.maxIterations,
    status: 'idle',
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    startTime: null,
    isRunning: false,
  });

  const hasStartedRef = useRef(false);
  const outputRef = useRef('');
  const autoIterateRef = useRef(true); // Auto-start next iteration when turn completes
  const iterationRef = useRef(1); // Track current iteration for async callbacks

  // Load prompt from file
  const loadPrompt = useCallback((): string => {
    // Resolve path relative to cwd if not absolute
    const promptPath = path.isAbsolute(config.promptFile)
      ? config.promptFile
      : path.resolve(config.cwd, config.promptFile);

    if (!fs.existsSync(promptPath)) {
      throw new Error(`Prompt file not found: ${promptPath}`);
    }
    return fs.readFileSync(promptPath, 'utf-8').trim();
  }, [config.promptFile, config.cwd]);

  // Create a logger that writes to the TUI
  // Note: claudeOutput, toolStart, toolEnd are handled by hook callbacks to avoid duplicates
  const createTuiLogger = useCallback(
    (): RalphLogger => ({
      debug: (msg: string) => {
        if (config.verbose) addLog('debug', msg);
      },
      info: (msg: string) => addLog('info', msg),
      warn: (msg: string) => addLog('warn', msg),
      error: (msg: string) => addLog('error', msg),
      success: (msg: string) => addLog('info', `[OK] ${msg}`),
      claudeOutput: () => {}, // Handled by onOutput callback
      toolStart: () => {},    // Handled by onToolStart callback
      toolEnd: () => {},      // Handled by onToolEnd callback
      iterationStart: () => {},
      iterationEnd: () => {},
      banner: () => {},
      complete: () => {},
    }),
    [addLog, config.verbose],
  );

  const { start, stop, restart, sendMessage, isRunning, isWaitingForInput } = useClaudeProcess({
    model: config.model,
    getPrompt: loadPrompt, // Pass function so prompt is re-read each iteration
    logger: createTuiLogger(),
    cwd: config.cwd,
    onOutput: (content: string) => {
      addLog('claude', content);
      // Track output for exit signal check (checked in onTurnComplete)
      outputRef.current += content;
    },
    onToolStart: (name: string) => addLog('tool', `[>] ${name}`),
    onToolEnd: (name: string, isError: boolean) =>
      addLog('tool', `${isError ? '[x]' : '[v]'} ${name}`),
    onTokens: (input: number, output: number) => {
      if (config.verbose) {
        addLog('debug', `[Tokens] in=${input}, out=${output}`);
      }
      setState((prev) => ({
        ...prev,
        inputTokens: input,
        outputTokens: output,
      }));
    },
    onComplete: (result) => {
      setState((prev) => ({
        ...prev,
        cost: prev.cost + (result.cost || 0),
        inputTokens: result.inputTokens || prev.inputTokens,
        outputTokens: result.outputTokens || prev.outputTokens,
        status: 'stopped',
        isRunning: false,
      }));
      markIterationComplete();
      addLog('system', '\n----- Session Complete -----');
    },
    onTurnComplete: () => {
      if (config.verbose) {
        addLog('debug', '[Turn Complete] Claude finished a turn');
      }

      // Claude finished a turn - check if we should auto-iterate
      if (!autoIterateRef.current) {
        if (config.verbose) {
          addLog('debug', '[Turn Complete] Auto-iterate disabled, waiting for user input');
        }
        return;
      }

      // Check if exit signal was detected
      if (outputRef.current.includes(config.exitSignal)) {
        addLog('system', `\n[OK] Exit signal detected: ${config.exitSignal}`);
        setState((prev) => ({ ...prev, status: 'stopped' }));
        stop();
        return;
      }

      // Check if max iterations reached
      if (iterationRef.current >= config.maxIterations) {
        addLog('system', '\n[WARN] Max iterations reached');
        setState((prev) => ({ ...prev, status: 'stopped' }));
        stop();
        return;
      }

      // Start next iteration
      iterationRef.current += 1;
      const nextIteration = iterationRef.current;
      addLog('system', `\n----- Iteration ${nextIteration}/${config.maxIterations} -----`);
      outputRef.current = ''; // Reset output buffer for new iteration

      setState((prev) => ({
        ...prev,
        currentIteration: nextIteration,
        status: 'running',
      }));

      // Restart with fresh Claude process after a small delay
      if (config.verbose) {
        addLog('debug', `[Turn Complete] Restarting Claude in 1.5s...`);
      }
      setTimeout(() => {
        if (config.verbose) {
          addLog('debug', `[Turn Complete] Starting fresh Claude process`);
        }
        restart(); // Spawn new process with fresh prompt (re-reads PROMPT.md)
      }, 1500);
    },
  });

  // Start the process on mount
  useEffect(() => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      addLog(
        'system',
        `Ralph Loop started - Model: ${config.model}\nType a message and press Enter to send to Claude.`,
      );
      setState((prev) => ({
        ...prev,
        status: 'running',
        isRunning: true,
        startTime: new Date(),
      }));
      start();
    }
  }, [start, addLog, config.model]);

  // Update status based on hook state
  useEffect(() => {
    setState((prev) => {
      // If process is running, always update status (even if was 'stopped')
      if (isRunning) {
        if (isWaitingForInput) {
          return { ...prev, isRunning, status: 'waiting' };
        }
        return { ...prev, isRunning, status: 'running' };
      }
      // Process not running - keep stopped if already stopped
      if (prev.status === 'stopped') return prev;
      return { ...prev, isRunning };
    });
  }, [isRunning, isWaitingForInput]);

  // Handle Ctrl+C
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      addLog('system', '\nInterrupt received, stopping...');
      stop();
      setState((prev) => ({ ...prev, status: 'stopped' }));
      setTimeout(() => exit(), 1000);
    }
  });

  // Handle user input message - send directly to running process
  const handleSubmit = useCallback(
    (message: string) => {
      if (isRunning) {
        addLog('info', `> ${message}`);
        sendMessage(message);
        setState((prev) => ({ ...prev, status: 'running' }));
      } else {
        addLog('warn', 'Cannot send message - Claude is not running');
      }
    },
    [addLog, sendMessage, isRunning],
  );

  return (
    <Box flexDirection="column" height="100%">
      <LogPane completedLogs={completedLogs} currentLogs={currentLogs} />
      <InputBox
        onSubmit={handleSubmit}
        disabled={state.status === 'stopped'}
        placeholder="Type message and press Enter to send to Claude..."
      />
      <StatusBar
        iteration={state.currentIteration}
        maxIterations={state.maxIterations}
        inputTokens={state.inputTokens}
        outputTokens={state.outputTokens}
        startTime={state.startTime}
        status={state.status}
        model={config.model}
        cwd={config.cwd}
      />
    </Box>
  );
}
