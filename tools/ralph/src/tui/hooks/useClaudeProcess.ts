import { useState, useCallback, useEffect, useRef } from 'react';
import {
  createInteractiveClaudeProcess,
  type ClaudeProcessHandle,
} from '../../claude-runner.ts';
import type { ClaudeRunResult, RalphLogger } from '../../types.ts';

interface UseClaudeProcessOptions {
  model: string;
  initialPrompt: string;
  logger: RalphLogger;
  cwd?: string;
  onOutput?: (content: string) => void;
  onToolStart?: (name: string) => void;
  onToolEnd?: (name: string, isError: boolean) => void;
  onComplete?: (result: ClaudeRunResult) => void;
  onTokens?: (input: number, output: number) => void;
}

export function useClaudeProcess(options: UseClaudeProcessOptions) {
  const [isRunning, setIsRunning] = useState(false);
  const processRef = useRef<ClaudeProcessHandle | null>(null);
  const optionsRef = useRef(options);

  // Keep options ref updated
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const start = useCallback(() => {
    if (processRef.current?.isRunning()) return;

    setIsRunning(true);
    processRef.current = createInteractiveClaudeProcess({
      model: optionsRef.current.model,
      initialPrompt: optionsRef.current.initialPrompt,
      logger: optionsRef.current.logger,
      cwd: optionsRef.current.cwd,
      events: {
        onOutput: (content: string) => optionsRef.current.onOutput?.(content),
        onToolStart: (name: string) => optionsRef.current.onToolStart?.(name),
        onToolEnd: (name: string, isError: boolean) =>
          optionsRef.current.onToolEnd?.(name, isError),
        onTokens: (input: number, output: number) =>
          optionsRef.current.onTokens?.(input, output),
        onResult: (result: ClaudeRunResult) => {
          setIsRunning(false);
          optionsRef.current.onComplete?.(result);
        },
      },
    });
  }, []);

  const sendMessage = useCallback((message: string) => {
    if (processRef.current?.isRunning()) {
      processRef.current.write(message);
    }
  }, []);

  const stop = useCallback(() => {
    processRef.current?.kill();
    setIsRunning(false);
  }, []);

  useEffect(() => {
    return () => {
      processRef.current?.kill();
    };
  }, []);

  return { start, stop, sendMessage, isRunning };
}
