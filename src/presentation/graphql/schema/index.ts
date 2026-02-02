/**
 * GraphQL Schema Registry
 *
 * Loads and combines all .graphql type definitions.
 * New schemas should be imported and added to the typeDefs array.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const schemaDir = dirname(fileURLToPath(import.meta.url));

function loadSchema(filename: string): string {
  return readFileSync(join(schemaDir, filename), 'utf-8');
}

export const typeDefs: string[] = [
  loadSchema('base.graphql'),
  loadSchema('accounts.graphql'),
];
