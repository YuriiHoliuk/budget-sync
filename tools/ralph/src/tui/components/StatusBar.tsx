import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import * as os from 'node:os';

interface StatusBarProps {
  iteration: number;
  maxIterations: number;
  inputTokens: number;
  outputTokens: number;
  startTime: Date | null;
  status: 'idle' | 'running' | 'waiting' | 'rate-limited' | 'stopped';
  model: string;
  cwd: string;
}

function formatElapsedTime(startTime: Date | null): string {
  if (!startTime) {
    return '0m';
  }

  const elapsedMs = Date.now() - startTime.getTime();
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m`;
}

function formatTokens(inputTokens: number, outputTokens: number): string {
  const total = inputTokens + outputTokens;
  if (total === 0) return '0';
  if (total >= 1000) {
    return `${(total / 1000).toFixed(1)}k`;
  }
  return `${total}`;
}

function shortenPath(fullPath: string): string {
  const homeDir = os.homedir();
  if (fullPath.startsWith(homeDir)) {
    return `~${fullPath.slice(homeDir.length)}`;
  }
  return fullPath;
}

function shortenModel(model: string): string {
  // Convert model IDs to shorter display names
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  return model;
}

function getStatusDisplay(
  status: StatusBarProps['status'],
): { text: string; color: string } {
  switch (status) {
    case 'running':
      return { text: 'Running', color: 'green' };
    case 'waiting':
      return { text: 'Waiting', color: 'cyan' };
    case 'rate-limited':
      return { text: 'Rate Limited', color: 'yellow' };
    case 'stopped':
      return { text: 'Stopped', color: 'red' };
    case 'idle':
    default:
      return { text: 'Idle', color: 'gray' };
  }
}

export function StatusBar({
  iteration,
  maxIterations,
  inputTokens,
  outputTokens,
  startTime,
  status,
  model,
  cwd,
}: StatusBarProps): React.ReactElement {
  const [elapsedTime, setElapsedTime] = useState(formatElapsedTime(startTime));

  useEffect(() => {
    if (!startTime || status === 'stopped' || status === 'idle') {
      setElapsedTime(formatElapsedTime(startTime));
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(formatElapsedTime(startTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, status]);

  const shortPath = shortenPath(cwd);
  const shortModel = shortenModel(model);
  const tokens = formatTokens(inputTokens, outputTokens);
  const statusDisplay = getStatusDisplay(status);

  return (
    <Box paddingX={1}>
      <Text dimColor>{shortPath}</Text>
      <Text> </Text>
      <Text color="blue">{tokens}</Text>
      <Text dimColor> tokens</Text>
      <Text> </Text>
      <Text color="cyan">{shortModel}</Text>
      <Text dimColor> · </Text>
      <Text color="magenta">{iteration}</Text>
      <Text dimColor>/</Text>
      <Text dimColor>{maxIterations}</Text>
      <Text dimColor> · </Text>
      <Text>{elapsedTime}</Text>
      <Text dimColor> · </Text>
      <Text color={statusDisplay.color}>{statusDisplay.text}</Text>
    </Box>
  );
}
