# ADR-002: GraphQL Schema Management Strategy

**Date**: 2026-02-06
**Status**: Decided
**Decision**: Keep schema-first with SDL files

## Context

The project uses Apollo Server with GraphQL schemas defined in `.graphql` files (SDL-first approach). The question is whether to migrate to a code-first approach (TypeGraphQL, Pothos, or Nexus) for better type safety and developer experience.

## Current Setup

**Schema Loading**:
- SDL files in `src/presentation/graphql/schema/*.graphql`
- Loaded via `readFileSync` in `schema/index.ts`
- Combined into array of type definitions

**Resolvers**:
- Injectable classes in `src/presentation/graphql/resolvers/`
- Manually typed to match schema

**Frontend Codegen**:
- `@graphql-codegen/client-preset` generates TypeScript types from SDL
- Types used in React components via generated hooks

## Research Findings

### Approach Comparison

**Schema-First (SDL)**:
- Write `.graphql` files, then implement resolvers
- Schema is the source of truth
- Better for collaboration (schema as contract)
- Requires manual synchronization between schema and resolvers

**Code-First**:
- Define schema in TypeScript code
- Schema generated from code
- Types inferred automatically
- Libraries: TypeGraphQL (decorators), Pothos (plugin-based), Nexus (declarative)

### Code-First Libraries (2025)

| Library | Approach | Prisma Support | Maintenance |
|---------|----------|----------------|-------------|
| Pothos | Plugin-based, fluent API | Excellent (dedicated plugin) | Active |
| TypeGraphQL | Decorators, classes | Good | Active |
| Nexus | Declarative syntax | Limited | Slower updates |

### Trade-offs

**Pros of migrating to code-first**:
- Type safety between schema and resolvers
- No manual sync required
- IDE autocomplete for schema building
- Pothos has excellent Prisma integration

**Cons of migrating to code-first**:
- Significant migration effort (8 schema files, ~20 resolvers)
- Team needs to learn new library patterns
- SDL still needed for frontend codegen (code-first generates it)
- Our schema is stable — type sync issues are rare
- Current injectable resolver pattern works well with DI

### Current Setup Assessment

Our current approach already addresses many code-first benefits:
- **Type generation**: Frontend uses `@graphql-codegen` for typed operations
- **Schema organization**: Modular `.graphql` files (one per domain)
- **Resolver structure**: Injectable classes follow clean architecture
- **Validation**: Zod schemas validate inputs at boundaries

The main gap is resolver-to-schema type safety, but this is caught by:
1. TypeScript errors when resolver returns wrong shape
2. Runtime GraphQL validation
3. Unit tests for resolvers
4. API integration tests

## Decision

**Keep schema-first with SDL files.**

Reasons:
1. **Stable schema**: Our schema is feature-complete and rarely changes
2. **Working codegen pipeline**: Frontend already uses generated types
3. **Clean architecture**: Resolvers are thin, delegate to use cases
4. **Migration cost**: Significant effort for marginal benefit
5. **Simplicity**: SDL files are readable, easy to review, and framework-agnostic

### Minor Improvements

Consider adding (as separate tasks if needed):
- GraphQL schema linting (`graphql-schema-linter`) for consistency
- Schema validation in CI to catch breaking changes

## Consequences

- Keep current SDL-first approach
- No migration to code-first libraries
- Continue using `@graphql-codegen` for frontend types
- Schema changes require manual resolver updates (acceptable for stable API)

## References

- [Schema-First vs Code-Only GraphQL](https://www.apollographql.com/blog/schema-first-vs-code-only-graphql)
- [Pothos GraphQL](https://pothos-graphql.dev/)
- [TypeGraphQL](https://typegraphql.com/)
- [Code-first vs schema-first development in GraphQL](https://blog.logrocket.com/code-first-vs-schema-first-development-graphql/)
- [Pothos vs TypeGraphQL comparison](https://blog.logrocket.com/pothos-vs-typegraphql-for-typescript-schema-building/)
