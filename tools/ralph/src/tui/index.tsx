import { render } from 'ink';
import { App } from './App.tsx';
import type { TuiConfig } from './types.ts';

export function renderTui(config: TuiConfig): Promise<void> {
  const { waitUntilExit } = render(<App config={config} />);
  return waitUntilExit();
}

export * from './types.ts';
