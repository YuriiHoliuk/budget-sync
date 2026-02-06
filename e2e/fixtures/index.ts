/**
 * E2E Test Fixtures
 *
 * This module exports test fixtures that provide:
 * - Pre-authenticated page context
 * - GraphQL API client for direct data manipulation
 * - Data factories for creating test entities
 * - Page Objects for structured page interactions
 * - Reusable component classes
 */

export { test, expect, type TestFixtures } from './test-base.ts';
export * from './data-factories.ts';
export * from '../pages';
export * from '../components';
