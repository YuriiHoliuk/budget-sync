import 'reflect-metadata';
import { setupContainer } from './container.ts';
import { ConsoleLogger, LOGGER_TOKEN } from './modules/logging/index.ts';
import { createCLI } from './presentation/cli/index.ts';

const container = setupContainer();

// Register ConsoleLogger for CLI
container.register(LOGGER_TOKEN, { useClass: ConsoleLogger });

const cli = createCLI(container);

cli.parse(process.argv);
