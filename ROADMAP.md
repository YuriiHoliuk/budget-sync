# Budget Sync Roadmap

Items are independent and can be implemented in any order.

---

## Planned

### Users & Shared Plans

Users with real authentication and shared "Plans" — the unit that owns budgets, accounts, categories, and transactions. Partners/families share a Plan to collaborate on a single budget. Brainstorm and data model design in progress: [`claude_plans/users-and-plans-brainstorm.md`](claude_plans/users-and-plans-brainstorm.md). Needs to finish brainstorming and get plan approval before implementation.

- [ ] Finalize data model (user-scoped vs plan-scoped, account ownership, open questions)
- [ ] Schema changes — users, plans, plan_members tables + plan_id on existing tables
- [ ] Migration for existing data (default user + default plan)
- [ ] Domain layer — User, Plan, PlanMember entities and repositories
- [ ] Query scoping — all queries filter by plan_id
- [ ] User registration and login (replace basic auth gate)
- [ ] OAuth providers (Google, Apple, etc.)
- [ ] Session management and token refresh
- [ ] Plan management UI — create, invite, accept
- [ ] Per-member permissions (owner, editor, viewer)
- [ ] Bank connections — move token to DB, associate with user + plan

### Mobile App

Standalone mobile app for transaction management on the go.

- [ ] Core transaction list and detail views
- [ ] Quick-add spending
- [ ] Push notifications (new transactions, uncategorized alerts)
- [ ] Budget overview

### Deterministic Categorization Rules Builder

Visual rule builder on the frontend for creating deterministic categorization rules.

- [ ] Condition editor — build conditions on transaction fields (description contains, amount >, MCC equals, etc.)
- [ ] AND/OR logic for combining conditions
- [ ] Assign category and/or budget when conditions match
- [ ] Priority ordering — rules evaluated before LLM
- [ ] Test rules against existing transactions before saving

### Telegram Bot

Telegram-based interface for notifications and quick actions.

- [ ] Push notifications (new transactions, uncategorized alerts)
- [ ] Record spendings for manual accounts via chat
- [ ] Transaction review and approval (approve, categorize, reject)
- [ ] Quick natural language commands ("Spent 500 on groceries", "Show uncategorized")

### AI-Native Interface

Natural language interface for all app operations.

- [ ] Text field + voice dictation on web UI
- [ ] Agent with tools that interprets user intent and performs operations (record transactions, categorize, query summaries, etc.)
- [ ] Tool/action confirmation before execution

### Custom Dashboard

User-configurable analytics dashboard.

- [ ] Chart builder — create charts from available data (transactions, budgets, categories, accounts)
- [ ] Supported chart types: column, pie, Sankey, line, etc.
- [ ] Drag-and-drop layout
- [ ] Save/load dashboards

### Smart Rule Suggestions

Auto-detect categorization patterns and suggest rules.

- [ ] Detect patterns when user overrides categorization (e.g., always re-assigns a certain description)
- [ ] Auto-generate suggested deterministic rules from these patterns
- [ ] Present suggestions for user approval before adding to active rules

### Manual Transaction UI

- [ ] Form on web UI to create transactions for manual (non-synced) accounts

### Spreadsheet Cleanup

- [ ] Remove Google Sheets dependency (code, modules, scripts, credentials) now that PostgreSQL is primary

### Runtime Env Vars & Production E2E

- [ ] Remove `NEXT_PUBLIC_*` bundled env vars in favor of runtime configuration (12-factor app)
- [ ] Build a single Docker image and run E2E tests against it instead of dev mode
- [ ] Same image for dev/staging/prod with different env vars

---

### Silpo Receipt Integration

Connect to Silpo API to fetch itemized receipts for Silpo transactions. Use item-level data for better categorization and potential transaction splitting.

- [ ] Silpo API connector (reference: [pysilpo](https://github.com/iYasha/pysilpo))
- [ ] Match Silpo receipts to bank transactions by amount/date
- [ ] Fetch and store item-level data (product name, quantity, price)
- [ ] Split transactions into per-item categories (e.g., groceries vs household)
- [ ] Use item details as context for LLM categorization

---

### Persistent Server & WebSockets

Move from Cloud Run (request-based) to an always-running self-hosted or cheap server. Enables WebSocket connections for real-time features.

- [ ] Migrate to a persistent server (VPS, Fly.io, Railway, etc.)
- [ ] Apollo subscriptions for real-time UI updates (new transactions, budget changes)
- [ ] Live collaboration in shared workspaces

---

## Ideas / Deferred

Low priority or blocked by other work:

- [ ] **Move database to GCP** — self-hosted or Cloud SQL PostgreSQL (cost consideration)

---

## Completed

### Cloud Deployment (Jan 2026)

CI/CD pipeline (GitHub Actions → Google Cloud Run), Terraform-managed infrastructure, Cloud Scheduler for polling.

### Data Model (Jan–Feb 2026)

Hierarchical categories, categorization/budgetization rules, budget allocations. Started as Google Sheets, migrated to Neon PostgreSQL with Drizzle ORM.

### Transaction Categorization (Jan 2026)

Rule-based engine with priority ordering, auto-apply during sync, LLM fallback via Google Gemini, batch categorize CLI.

### Real-time Sync (Jan 2026)

Monobank webhook integration, Pub/Sub async processing with dead letter queue, polling fallback.

### Platform Migration (Jan–Feb 2026)

PostgreSQL + GraphQL API + Next.js 15 web UI. Budget page, accounts page, categories page, transaction detail panel. E2E tests with Playwright. Deployed to Cloud Run.

### Transaction UI Improvements (Feb 2026)

Fee transaction display, returnings rendered as single rows, transfer display cleanup, type filter (transfer/returning).

### Verification & Rules UI (Feb 2026)

Quick-verify/categorize panels with batch actions. AI rules editor with plaintext prompt editing. Unified rules management UI.

### Database Migration US → EU (Feb 2026)

Migrated Neon database from `aws-us-west-2` to `aws-eu-central-1` (Frankfurt), closer to Cloud Run in Warsaw.

### Budget Fund Movement Audit (Feb 2026)

Validated and fixed month-to-month fund transfers for all budget types (spending, savings, debt).
