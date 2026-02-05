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

  // Create a logger that writes to the TUI (but skip claudeOutput since hook handles it)
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
      toolStart: (name: string) => addLog('tool', `[>] ${name}`),
      toolEnd: (name: string, isError: boolean) =>
        addLog('tool', `${isError ? '[x]' : '[v]'} ${name}`),
      iterationStart: () => {},
      iterationEnd: () => {},
      banner: () => {},
      complete: () => {},
    }),
    [addLog, config.verbose],
  );

  // Check for exit signal in output
  const checkExitSignal = useCallback(
    (content: string): boolean => {
      outputRef.current += content;
      return outputRef.current.includes(config.exitSignal);
    },
    [config.exitSignal],
  );

  const { start, stop, sendMessage, isRunning } = useClaudeProcess({
    model: config.model,
    initialPrompt: loadPrompt(),
    logger: createTuiLogger(),
    cwd: config.cwd,
    onOutput: (content: string) => {
      addLog('claude', content);
      if (checkExitSignal(content)) {
        addLog('system', `\n[OK] Exit signal detected: ${config.exitSignal}`);
        setState((prev) => ({ ...prev, status: 'stopped' }));
        stop();
      }
    },
    onToolStart: (name: string) => addLog('tool', `[>] ${name}`),
    onToolEnd: (name: string, isError: boolean) =>
      addLog('tool', `${isError ? '[x]' : '[v]'} ${name}`),
    onTokens: (input: number, output: number) => {
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
        status: 'stopped',
        isRunning: false,
      }));
      markIterationComplete();
      addLog('system', '\n----- Session Complete -----');
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

  // Update isRunning state when hook changes
  useEffect(() => {
    setState((prev) => ({ ...prev, isRunning }));
  }, [isRunning]);

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
      } else {
        addLog('warn', 'Cannot send message - Claude is not running');
      }
    },
    [addLog, sendMessage, isRunning],
  );

  return (
    <Box flexDirection="column" height="100%">
      <LogPane completedLogs={completedLogs} currentLogs={currentLogs} />
      <StatusBar
        iteration={state.currentIteration}
        maxIterations={state.maxIterations}
        inputTokens={state.inputTokens}
        outputTokens={state.outputTokens}
        startTime={state.startTime}
        status={state.status}
        cost={state.cost}
      />
      <InputBox
        onSubmit={handleSubmit}
        disabled={state.status === 'stopped'}
        placeholder="Type message and press Enter to send to Claude..."
      />
    </Box>
  );
}
