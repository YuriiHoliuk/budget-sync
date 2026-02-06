# ADR-001: Frontend Linting Strategy

**Date**: 2026-02-06
**Status**: Decided
**Decision**: Keep ESLint for frontend

## Context

The backend uses Biome for linting and formatting. The question is whether to migrate the frontend from ESLint to Biome for consistency.

## Current Setup

**Backend (Biome)**:
- `biome.json` with comprehensive rules
- Key rule: `noExcessiveCognitiveComplexity` (max 10)
- Includes `src/**/*.ts` and `tests/**/*.ts`

**Frontend (ESLint)**:
- `eslint.config.mjs` extending `next/core-web-vitals` and `next/typescript`
- Standard Next.js linting rules

## Research Findings

### Biome Support (as of 2025/2026)

1. **Next.js 15.5 Official Integration** (August 2025): Next.js now offers Biome as a first-class option during project creation with optimized configurations.

2. **JSX/React Support**: Biome has full JSX and React hooks support with 90% coverage of ESLint's React plugin rules.

3. **Performance**: 10-25x faster than ESLint + Prettier.

4. **Biome 2.0**: Gained type inference capabilities (85% coverage of typescript-eslint).

### Trade-offs

**Pros of migrating to Biome**:
- Consistency with backend tooling
- Single configuration language/format
- Faster lint times
- `noExcessiveCognitiveComplexity` already configured for backend

**Cons of migrating to Biome**:
- Next.js-specific rules (`next/core-web-vitals`) are ESLint-only
- These rules catch Next.js-specific issues (Image optimization, links, etc.)
- Would need to manually add equivalent rules or accept coverage gaps
- Migration effort with minimal benefit

### Key Missing Rules in Biome

The `next/core-web-vitals` preset includes:
- `@next/next/no-html-link-for-pages` - Use Next.js Link
- `@next/next/no-img-element` - Use Next.js Image
- `@next/next/google-font-display` - Font display best practices
- `@next/next/no-sync-scripts` - Avoid sync scripts
- And many more Next.js-specific optimizations

These are not available in Biome.

## Decision

**Keep ESLint for frontend.**

Reasons:
1. `next/core-web-vitals` provides important Next.js-specific rules that Biome cannot replicate
2. The frontend is a separate project with its own package.json — different tooling is acceptable
3. Migration effort is not justified for a single-user personal project
4. ESLint with `next/typescript` already provides TypeScript checking

## Consequences

- Frontend and backend use different linters (acceptable)
- `just check` runs both: `bun run check` (Biome) and `cd web && bun run lint` (ESLint)
- Developers need to be aware of both tools
- No additional migration work needed

## References

- [How to use Biome with Next.js](https://www.timsanteford.com/posts/how-to-use-biome-with-next-js-for-linting-and-formatting/)
- [Next.js + Biome Discussion](https://github.com/vercel/next.js/discussions/59347)
- [Biome Roadmap 2025](https://biomejs.dev/blog/roadmap-2025/)
