import { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputBoxProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InputBox({
  onSubmit,
  disabled = false,
  placeholder = 'Type message and press Enter...',
}: InputBoxProps) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      onSubmit(value.trim());
      setValue('');
    }
  };

  return (
    <Box flexDirection="column">
      {/* Separator line */}
      <Box paddingX={1}>
        <Text dimColor>{'─'.repeat(60)}</Text>
      </Box>
      {/* Input line */}
      <Box paddingX={1} paddingY={0}>
        <Text color={disabled ? 'gray' : 'cyan'}>❯ </Text>
        {disabled ? (
          <Text dimColor>{placeholder}</Text>
        ) : (
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            placeholder={placeholder}
          />
        )}
      </Box>
    </Box>
  );
}
