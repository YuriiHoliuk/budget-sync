import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  iteration: number;
  maxIterations: number;
  inputTokens: number;
  outputTokens: number;
  startTime: Date | null;
  status: 'idle' | 'running' | 'rate-limited' | 'stopped';
  cost: number;
}

function formatNumber(num: number): string {
  if (num >= 10000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return num.toString();
}

function formatElapsedTime(startTime: Date | null): string {
  if (!startTime) {
    return '0m 0s';
  }

  const elapsedMs = Date.now() - startTime.getTime();
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}m ${seconds}s`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

function getStatusColor(status: StatusBarProps['status']): string {
  switch (status) {
    case 'running':
      return 'green';
    case 'rate-limited':
      return 'yellow';
    case 'stopped':
      return 'red';
    case 'idle':
    default:
      return 'gray';
  }
}

function getStatusText(status: StatusBarProps['status']): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'rate-limited':
      return 'Rate Limited';
    case 'stopped':
      return 'Stopped';
    case 'idle':
    default:
      return 'Idle';
  }
}

export function StatusBar({
  iteration,
  maxIterations,
  inputTokens,
  outputTokens,
  startTime,
  status,
  cost,
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

  const statusColor = getStatusColor(status);
  const statusText = getStatusText(status);

  return (
    <Box borderStyle="single" paddingX={1}>
      <Text>
        <Text bold>Iteration </Text>
        <Text color="cyan">{iteration}</Text>
        <Text>/{maxIterations}</Text>
        <Text> | </Text>
        <Text bold>Tokens: </Text>
        <Text color="blue">{formatNumber(inputTokens)}</Text>
        <Text>/</Text>
        <Text color="magenta">{formatNumber(outputTokens)}</Text>
        <Text> | </Text>
        <Text bold>Cost: </Text>
        <Text color="yellow">{formatCost(cost)}</Text>
        <Text> | </Text>
        <Text>{elapsedTime}</Text>
        <Text> | </Text>
        <Text color={statusColor} bold>
          {statusText}
        </Text>
      </Text>
    </Box>
  );
}
