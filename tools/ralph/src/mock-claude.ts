import type { ClaudeRunResult, RalphLogger } from './types.ts';

interface MockResponse {
  delay: number;
  output: string;
  exitCode: number;
  isRateLimited?: boolean;
}

interface MockScenario {
  name: string;
  iterations: number;
  responses: MockResponse[];
}

const MOCK_SCENARIOS: MockScenario[] = [
  {
    name: 'successful_completion',
    iterations: 3,
    responses: [
      {
        delay: 2000,
        output:
          'Starting task processing...\nAnalyzing codebase...\nFound 3 items to process.',
        exitCode: 0,
      },
      {
        delay: 3000,
        output:
          'Processing item 1/3...\nItem 1 completed successfully.\nProcessing item 2/3...\nItem 2 completed successfully.',
        exitCode: 0,
      },
      {
        delay: 2500,
        output:
          'Processing item 3/3...\nItem 3 completed successfully.\nAll items processed.\nRALPH_DONE',
        exitCode: 0,
      },
    ],
  },
  {
    name: 'with_rate_limit',
    iterations: 4,
    responses: [
      {
        delay: 1500,
        output: 'Starting task...',
        exitCode: 0,
      },
      {
        delay: 500,
        output: 'Error: Rate limit exceeded. Please wait before retrying.',
        exitCode: 1,
        isRateLimited: true,
      },
      {
        delay: 2000,
        output: 'Continuing after rate limit...\nTask progress: 50%',
        exitCode: 0,
      },
      {
        delay: 2000,
        output: 'Task completed!\nRALPH_DONE',
        exitCode: 0,
      },
    ],
  },
  {
    name: 'with_error_recovery',
    iterations: 3,
    responses: [
      {
        delay: 2000,
        output: 'Starting migration...',
        exitCode: 0,
      },
      {
        delay: 1000,
        output: 'Error: Connection failed. Retrying...',
        exitCode: 1,
      },
      {
        delay: 3000,
        output:
          'Retry successful. Migration completed.\nRALPH_DONE',
        exitCode: 0,
      },
    ],
  },
];

let currentScenario: MockScenario | null = null;
let currentIteration = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function setMockScenario(name: string): void {
  const scenario = MOCK_SCENARIOS.find(
    (mockScenario) => mockScenario.name === name,
  );
  if (!scenario) {
    console.warn(`Unknown scenario: ${name}, using default`);
    currentScenario = MOCK_SCENARIOS[0];
  } else {
    currentScenario = scenario;
  }
  currentIteration = 0;
}

export function resetMock(): void {
  currentScenario = null;
  currentIteration = 0;
}

export async function runMockClaude(
  logger: RalphLogger,
  onOutput?: (content: string) => void,
): Promise<ClaudeRunResult> {
  if (!currentScenario) {
    currentScenario = MOCK_SCENARIOS[0];
  }

  const responseIndex =
    currentIteration % currentScenario.responses.length;
  const response = currentScenario.responses[responseIndex];
  currentIteration++;

  logger.debug(
    `[MOCK] Using scenario: ${currentScenario.name}, response ${responseIndex + 1}/${currentScenario.responses.length}`,
  );

  const lines = response.output.split('\n');

  for (const line of lines) {
    if (line.trim()) {
      logger.claudeOutput(line);
      onOutput?.(line);
    }
    await sleep(200 + Math.random() * 300);
  }

  await sleep(response.delay);

  return {
    success: response.exitCode === 0,
    output: response.output,
    exitCode: response.exitCode,
    isRateLimited: response.isRateLimited || false,
    cost: 0.001 * Math.random(),
    durationMs: response.delay + lines.length * 250,
  };
}

export const AVAILABLE_SCENARIOS = MOCK_SCENARIOS.map(
  (scenario) => scenario.name,
);
