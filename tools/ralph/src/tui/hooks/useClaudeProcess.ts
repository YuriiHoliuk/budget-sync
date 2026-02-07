import { useState, useCallback, useEffect, useRef } from 'react';
import {
  createInteractiveClaudeProcess,
  type ClaudeProcessHandle,
} from '../../claude-runner.ts';
import type { ClaudeRunResult, RalphLogger } from '../../types.ts';

interface UseClaudeProcessOptions {
  model: string;
  getPrompt: () => string; // Function to get fresh prompt (re-reads file each time)
  logger: RalphLogger;
  cwd?: string;
  onOutput?: (content: string) => void;
  onToolStart?: (name: string) => void;
  onToolEnd?: (name: string, isError: boolean) => void;
  onComplete?: (result: ClaudeRunResult) => void;
  onTokens?: (input: number, output: number) => void;
  onTurnComplete?: () => void;
}

export function useClaudeProcess(options: UseClaudeProcessOptions) {
  const [isRunning, setIsRunning] = useState(false);
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const processRef = useRef<ClaudeProcessHandle | null>(null);
  const optionsRef = useRef(options);
  const isRestartingRef = useRef(false); // Track intentional restarts

  // Keep options ref updated
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Internal function to spawn a new Claude process
  const spawnProcess = useCallback((prompt: string) => {
    // Kill existing process if any
    if (processRef.current) {
      isRestartingRef.current = true; // Mark as intentional restart
      processRef.current.kill();
      processRef.current = null;
    }

    setIsRunning(true);
    setIsWaitingForInput(false);

    processRef.current = createInteractiveClaudeProcess({
      model: optionsRef.current.model,
      initialPrompt: prompt,
      logger: optionsRef.current.logger,
      cwd: optionsRef.current.cwd,
      events: {
        onOutput: (content: string) => optionsRef.current.onOutput?.(content),
        onToolStart: (name: string) => {
          setIsWaitingForInput(false); // Claude is working
          optionsRef.current.onToolStart?.(name);
        },
        onToolEnd: (name: string, isError: boolean) =>
          optionsRef.current.onToolEnd?.(name, isError),
        onTokens: (input: number, output: number) =>
          optionsRef.current.onTokens?.(input, output),
        onTurnComplete: () => {
          setIsWaitingForInput(true);
          optionsRef.current.onTurnComplete?.();
        },
        onResult: (result: ClaudeRunResult) => {
          // Skip onComplete if this was an intentional restart
          if (isRestartingRef.current) {
            isRestartingRef.current = false;
            return;
          }
          setIsRunning(false);
          setIsWaitingForInput(false);
          optionsRef.current.onComplete?.(result);
        },
      },
    });
  }, []);

  // Start initial process
  const start = useCallback(() => {
    if (processRef.current?.isRunning()) return;
    const prompt = optionsRef.current.getPrompt();
    spawnProcess(prompt);
  }, [spawnProcess]);

  // Restart with fresh prompt (for new iterations)
  const restart = useCallback(() => {
    const prompt = optionsRef.current.getPrompt();
    spawnProcess(prompt);
  }, [spawnProcess]);

  // Send message to current process (for interactive use within same iteration)
  const sendMessage = useCallback((message: string) => {
    if (processRef.current?.isRunning()) {
      setIsWaitingForInput(false); // Claude will start working
      processRef.current.write(message);
    }
  }, []);

  const stop = useCallback(() => {
    processRef.current?.kill();
    processRef.current = null;
    setIsRunning(false);
    setIsWaitingForInput(false);
  }, []);

  useEffect(() => {
    return () => {
      processRef.current?.kill();
    };
  }, []);

  return { start, stop, restart, sendMessage, isRunning, isWaitingForInput };
}
