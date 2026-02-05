import { useState, useCallback } from 'react';
import type { LogEntry, LogType } from '../types.ts';

let logIdCounter = 0;

function generateLogId(): string {
  return `log-${Date.now()}-${++logIdCounter}`;
}

interface UseLogsReturn {
  completedLogs: LogEntry[];
  currentLogs: LogEntry[];
  addLog: (type: LogType, content: string, metadata?: LogEntry['metadata']) => void;
  markIterationComplete: () => void;
  clearAll: () => void;
}

export function useLogs(): UseLogsReturn {
  const [completedLogs, setCompletedLogs] = useState<LogEntry[]>([]);
  const [currentLogs, setCurrentLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((type: LogType, content: string, metadata?: LogEntry['metadata']) => {
    const entry: LogEntry = {
      id: generateLogId(),
      type,
      content,
      timestamp: new Date(),
      metadata,
    };
    setCurrentLogs(prev => [...prev, entry]);
  }, []);

  const markIterationComplete = useCallback(() => {
    setCompletedLogs(prev => [...prev, ...currentLogs]);
    setCurrentLogs([]);
  }, [currentLogs]);

  const clearAll = useCallback(() => {
    setCompletedLogs([]);
    setCurrentLogs([]);
  }, []);

  return { completedLogs, currentLogs, addLog, markIterationComplete, clearAll };
}
