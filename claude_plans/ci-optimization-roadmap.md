# CI Optimization Roadmap

## Future improvements to explore

### Neon DB branching for E2E tests

Replace Docker Compose PostgreSQL setup in E2E with Neon database branching.
Instead of spinning up a fresh postgres container, running migrations, and seeding
(~1m 45s), create an instant Neon branch from a pre-seeded template branch.

**Benefits:**
- Instant DB provisioning (copy-on-write, <1s vs ~1m 45s)
- Removes Docker Compose dependency from E2E setup
- API server could run directly on the runner, avoiding Docker overhead

**Considerations:**
- Adds Neon dependency to CI (network latency to cloud DB vs local container)
- Need a "template" branch with seed data, kept up to date
- Test isolation: each E2E run gets its own branch, deleted after

### Lightweight frontend alternative for E2E and production

Explore replacing Next.js with a lighter framework for faster builds and E2E startup.
Current Next.js build takes 20-40s in container; a lighter alternative could reduce this.

**Options to research:**
- Vite + React Router (SSR optional, much faster builds)
- TanStack Start (full-stack, Vite-based)
- Static export (`next export`) if SSR is not needed (currently only used for API proxy rewrite)

**For E2E specifically:**
- Could use a Vite dev server (instant HMR, no compilation wait)
- Or pre-built static bundle served by a simple HTTP server

**Considerations:**
- Current Next.js features used: API rewrites (proxy), standalone output, App Router
- Migration effort is significant but the proxy rewrite is the only server-side feature
- Evaluate after the app stabilizes and if build times become a bigger bottleneck
