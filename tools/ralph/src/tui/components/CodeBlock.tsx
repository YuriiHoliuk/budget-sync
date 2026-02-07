import { Box, Text } from 'ink';
import highlight from 'cli-highlight';

interface CodeBlockProps {
  code: string;
  language?: string;
}

function highlightCode(code: string, language?: string): string {
  try {
    return highlight(code, {
      language: language || 'plaintext',
      ignoreIllegals: true,
    });
  } catch {
    // Fallback to plain text if highlighting fails
    return code;
  }
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const highlighted = highlightCode(code, language);

  return (
    <Box flexDirection="column" marginLeft={2} marginY={1}>
      {language && <Text dimColor>{language}</Text>}
      <Text>{highlighted}</Text>
    </Box>
  );
}
