import { Box, Text, Static } from 'ink';
import type { LogEntry } from '../types.ts';
import { CodeBlock } from './CodeBlock.tsx';

interface LogPaneProps {
  completedLogs: LogEntry[];
  currentLogs: LogEntry[];
}

interface ParsedPart {
  type: 'text' | 'code' | 'diff';
  content: string;
  language?: string;
}

interface BulletConfig {
  symbol: string;
  color: string;
}

function getBulletConfig(type: LogEntry['type']): BulletConfig {
  switch (type) {
    case 'claude':
      return { symbol: '●', color: 'cyan' };
    case 'tool':
      return { symbol: '●', color: 'yellow' };
    case 'info':
      return { symbol: '●', color: 'blue' };
    case 'warn':
      return { symbol: '●', color: 'yellow' };
    case 'error':
      return { symbol: '●', color: 'red' };
    case 'debug':
      return { symbol: '○', color: 'gray' };
    case 'system':
    default:
      return { symbol: '●', color: 'white' };
  }
}

function getTextColor(type: LogEntry['type']): string | undefined {
  switch (type) {
    case 'warn':
      return 'yellow';
    case 'error':
      return 'red';
    case 'debug':
      return 'gray';
    default:
      return undefined; // Use terminal default color
  }
}

function isDiffContent(content: string): boolean {
  // Check if content looks like a diff (has +/- lines or @@ markers)
  const lines = content.split('\n');
  let diffLineCount = 0;
  for (const line of lines) {
    if (
      line.startsWith('+') ||
      line.startsWith('-') ||
      line.startsWith('@@') ||
      line.startsWith('diff ')
    ) {
      diffLineCount++;
    }
  }
  // Consider it a diff if more than 20% of lines are diff-like
  return diffLineCount > 0 && diffLineCount / lines.length > 0.2;
}

function parseCodeBlocks(content: string): ParsedPart[] {
  const parts: ParsedPart[] = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textContent = content.slice(lastIndex, match.index);
      if (isDiffContent(textContent)) {
        parts.push({ type: 'diff', content: textContent });
      } else {
        parts.push({ type: 'text', content: textContent });
      }
    }

    const codeContent = match[2];
    const language = match[1] || undefined;

    // Check if the code block is a diff
    if (language === 'diff' || isDiffContent(codeContent)) {
      parts.push({ type: 'diff', content: codeContent, language: 'diff' });
    } else {
      parts.push({ type: 'code', content: codeContent, language });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const textContent = content.slice(lastIndex);
    if (isDiffContent(textContent)) {
      parts.push({ type: 'diff', content: textContent });
    } else {
      parts.push({ type: 'text', content: textContent });
    }
  }

  return parts.length > 0 ? parts : [{ type: 'text', content }];
}

function DiffBlock({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <Box flexDirection="column" marginLeft={2} marginY={1}>
      {lines.map((line, index) => {
        let color: string;
        let dimmed = false;

        if (line.startsWith('+') && !line.startsWith('+++')) {
          color = 'green';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          color = 'red';
        } else if (line.startsWith('@@')) {
          color = 'cyan';
        } else if (line.startsWith('diff ') || line.startsWith('index ')) {
          color = 'gray';
          dimmed = true;
        } else {
          color = 'white';
          dimmed = true;
        }

        return (
          <Text key={index} color={color} dimColor={dimmed}>
            {line}
          </Text>
        );
      })}
    </Box>
  );
}

function formatToolLine(content: string): { isToolStart: boolean; formatted: React.ReactNode } {
  // Match tool start pattern: [>] ToolName or ● ToolName
  const toolStartMatch = content.match(/^\[>\]\s*(\w+)(?:\s*\((.*)\))?$/);
  if (toolStartMatch) {
    const toolName = toolStartMatch[1];
    const args = toolStartMatch[2];
    return {
      isToolStart: true,
      formatted: (
        <Text>
          <Text color="yellow">● </Text>
          <Text color="yellow" bold>
            {toolName}
          </Text>
          {args && <Text dimColor>({args})</Text>}
        </Text>
      ),
    };
  }

  // Match tool end pattern: [v] ToolName or [x] ToolName
  const toolEndMatch = content.match(/^\[([vx])\]\s*(\w+)$/);
  if (toolEndMatch) {
    const isError = toolEndMatch[1] === 'x';
    const toolName = toolEndMatch[2];
    return {
      isToolStart: false,
      formatted: (
        <Text>
          <Text dimColor>└ </Text>
          <Text color={isError ? 'red' : 'green'}>{toolName}</Text>
          <Text dimColor> {isError ? 'failed' : 'completed'}</Text>
        </Text>
      ),
    };
  }

  return { isToolStart: false, formatted: null };
}

function LogLine({ entry }: { entry: LogEntry }) {
  const bullet = getBulletConfig(entry.type);
  const textColor = getTextColor(entry.type);

  // Handle tool log entries with special formatting
  if (entry.type === 'tool') {
    const { formatted, isToolStart } = formatToolLine(entry.content);
    if (formatted) {
      // Tool start entries get small margin, tool end entries have less
      return (
        <Box paddingX={1} marginBottom={isToolStart ? 0 : 1}>
          {formatted}
        </Box>
      );
    }
  }

  const parts = parseCodeBlocks(entry.content);

  // For simple single-line text, show with bullet
  if (parts.length === 1 && parts[0].type === 'text' && !parts[0].content.includes('\n')) {
    return (
      <Box paddingX={1} marginBottom={1}>
        <Text color={bullet.color}>{bullet.symbol} </Text>
        <Text color={textColor}>{parts[0].content}</Text>
      </Box>
    );
  }

  // For multi-part or multi-line content
  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      {parts.map((part, index) => {
        if (part.type === 'code') {
          return <CodeBlock key={index} code={part.content} language={part.language} />;
        }
        if (part.type === 'diff') {
          return <DiffBlock key={index} content={part.content} />;
        }

        // Handle multi-line text
        const lines = part.content.split('\n');
        return (
          <Box key={index} flexDirection="column">
            {lines.map((line, lineIndex) => {
              // First line of first part gets a bullet
              const showBullet = index === 0 && lineIndex === 0;
              if (line.trim() === '') {
                return <Text key={lineIndex}> </Text>;
              }
              if (showBullet) {
                return (
                  <Box key={lineIndex}>
                    <Text color={bullet.color}>{bullet.symbol} </Text>
                    <Text color={textColor}>{line}</Text>
                  </Box>
                );
              }
              return (
                <Text key={lineIndex} color={textColor}>
                  {'  '}{line}
                </Text>
              );
            })}
          </Box>
        );
      })}
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
