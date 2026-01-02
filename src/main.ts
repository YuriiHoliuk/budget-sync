import 'reflect-metadata';
import { setupContainer } from './container.ts';
import { createCLI } from './presentation/cli/index.ts';

const container = setupContainer();
const cli = createCLI(container);

cli.parse(process.argv);
