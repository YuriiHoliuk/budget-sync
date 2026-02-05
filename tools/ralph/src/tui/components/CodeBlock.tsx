import React from 'react';
import { Box, Text } from 'ink';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  return (
    <Box flexDirection="column" marginY={1} paddingX={1} borderStyle="round" borderColor="gray">
      {language && (
        <Text dimColor>{language}</Text>
      )}
      <Text>{code}</Text>
    </Box>
  );
}
