import React from 'react';
import { Box, Text, Static } from 'ink';
import type { LogEntry } from '../types.ts';
import { CodeBlock } from './CodeBlock.tsx';

interface LogPaneProps {
  completedLogs: LogEntry[];
  currentLogs: LogEntry[];
}

interface ParsedPart {
  type: 'text' | 'code';
  content: string;
  language?: string;
}

function getColor(type: LogEntry['type']): string {
  switch (type) {
    case 'info':
      return 'blue';
    case 'warn':
      return 'yellow';
    case 'error':
      return 'red';
    case 'claude':
      return 'cyan';
    case 'tool':
      return 'magenta';
    case 'debug':
      return 'gray';
    case 'system':
    default:
      return 'white';
  }
}

function parseCodeBlocks(content: string): ParsedPart[] {
  const parts: ParsedPart[] = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', content: match[2], language: match[1] || undefined });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content }];
}

function LogLine({ entry }: { entry: LogEntry }) {
  const color = getColor(entry.type);
  const parts = parseCodeBlocks(entry.content);

  return (
    <Box flexDirection="column">
      {parts.map((part, index) =>
        part.type === 'code' ? (
          <CodeBlock key={index} code={part.content} language={part.language} />
        ) : (
          <Text key={index} color={color}>
            {part.content}
          </Text>
        )
      )}
    </Box>
  );
}

export function LogPane({ completedLogs, currentLogs }: LogPaneProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Static items={completedLogs}>
        {(entry) => <LogLine key={entry.id} entry={entry} />}
      </Static>
      <Box flexDirection="column">
        {currentLogs.map((entry) => (
          <LogLine key={entry.id} entry={entry} />
        ))}
      </Box>
    </Box>
  );
}
