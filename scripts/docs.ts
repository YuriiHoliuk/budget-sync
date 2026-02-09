#!/usr/bin/env bun
/**
 * Documentation CLI tool.
 *
 * Usage:
 *   bun scripts/docs.ts list           # List all docs with titles (compact)
 *   bun scripts/docs.ts detail         # List all docs with descriptions
 *   bun scripts/docs.ts detail <name>  # Show detail for a specific doc
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DOCS_DIR = join(import.meta.dir, '..', 'docs');

interface DocInfo {
  path: string;
  title: string;
  description: string | null;
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findMarkdownFiles(fullPath);
      files.push(...nested);
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function parseFrontmatter(content: string): { description: string | null; bodyStart: number } {
  if (!content.startsWith('---')) {
    return { description: null, bodyStart: 0 };
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return { description: null, bodyStart: 0 };
  }

  const frontmatter = content.slice(3, endIndex).trim();
  const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/m);
  const description = descriptionMatch ? descriptionMatch[1].trim().replace(/^["']|["']$/g, '') : null;

  return { description, bodyStart: endIndex + 3 };
}

function extractTitle(content: string, bodyStart: number): string {
  const body = content.slice(bodyStart).trim();
  const titleMatch = body.match(/^#\s+(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : '(no title)';
}

async function parseDoc(filePath: string): Promise<DocInfo> {
  const content = await readFile(filePath, 'utf-8');
  const { description, bodyStart } = parseFrontmatter(content);
  const title = extractTitle(content, bodyStart);
  const relativePath = relative(join(DOCS_DIR, '..'), filePath);

  return { path: relativePath, title, description };
}

async function listDocs(): Promise<void> {
  const files = await findMarkdownFiles(DOCS_DIR);
  const docs = await Promise.all(files.map(parseDoc));

  const maxPath = Math.max(...docs.map((doc) => doc.path.length));

  for (const doc of docs) {
    console.log(`  ${doc.path.padEnd(maxPath + 2)} ${doc.title}`);
  }
}

async function detailDocs(filter?: string): Promise<void> {
  const files = await findMarkdownFiles(DOCS_DIR);
  const docs = await Promise.all(files.map(parseDoc));

  const filtered = filter
    ? docs.filter(
        (doc) =>
          doc.path.toLowerCase().includes(filter.toLowerCase()) ||
          doc.title.toLowerCase().includes(filter.toLowerCase()),
      )
    : docs;

  if (filtered.length === 0) {
    console.log(`No docs found matching "${filter}"`);
    process.exit(1);
  }

  for (const doc of filtered) {
    console.log(`  ${doc.path}`);
    console.log(`  ${doc.title}`);
    if (doc.description) {
      console.log(`  ${doc.description}`);
    } else {
      console.log('  (no description)');
    }
    console.log();
  }
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'list':
    await listDocs();
    break;
  case 'detail':
    await detailDocs(args[0]);
    break;
  default:
    console.log('Usage:');
    console.log('  bun scripts/docs.ts list           # List all docs with titles');
    console.log('  bun scripts/docs.ts detail         # List all docs with descriptions');
    console.log('  bun scripts/docs.ts detail <name>  # Show detail for a specific doc');
    process.exit(command ? 1 : 0);
}
