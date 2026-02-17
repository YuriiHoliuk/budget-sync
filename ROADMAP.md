# Budget Sync Roadmap

## Phase 1: Cloud Deployment `completed`

> Deployed Jan 3-4, 2026

- [x] Set up CI/CD pipeline (GitHub Actions → Google Cloud)
- [x] Deploy system to Google Cloud Run
- [x] Manage infrastructure with Terraform (service accounts, IAM, secrets, scheduler)
- [x] Configure Cloud Scheduler for transaction polling every 3 hours

---

## Phase 2: Data Model `completed`

> Started as Google Sheets (Jan 2), migrated to PostgreSQL (Feb 1, 2026)

- [x] Categories — hierarchical with parent categories and status tracking
- [x] Categorization rules — deterministic pattern → category mapping
- [x] Budgetization rules — deterministic pattern → budget mapping
- [x] Budget allocations — monthly amounts per budget, allocated vs spent tracking

Originally implemented as spreadsheet sheets, then migrated to Neon PostgreSQL with Drizzle ORM during Phase 8.

---

## Phase 3: Transaction Categorization `completed`

> Jan 8-24, 2026

- [x] Rule-based categorization engine with priority ordering
- [x] Auto-apply rules during transaction sync
- [x] LLM fallback via Google Gemini for unmatched transactions
- [x] Separate LLM calls for category and budget inference
- [x] Batch categorize CLI command for uncategorized transactions

---

## Phase 4: Real-time Sync `completed`

> Jan 6, 2026

- [x] Monobank webhook integration for instant transaction updates
- [x] HTTP endpoints for webhook validation and processing
- [x] Pub/Sub async processing with dead letter queue
- [x] Polling job kept as fallback (every 3 hours)

---

## Phase 5: Chat Interface `not started` → merged into Phase 11

~~Originally planned as standalone phase. Now part of Phase 11 (Telegram Bot).~~

---

## Phase 6: Review System `not started` → merged into Phase 10

~~Originally planned as standalone phase. Review/approval workflows now part of Phase 10 (Rules UI) and Phase 11 (Telegram Bot).~~

---

## Phase 7: Spreadsheet Dashboard `superseded`

> Jan 24, 2026 — Dashboard scripts created, then superseded by web UI

- [x] Dashboard sheet setup scripts
- ~~Format and style data sheets~~ — replaced by web UI
- ~~Dashboard with summary formulas~~ — replaced by web UI

Spreadsheet is no longer the primary interface. Web UI (Phase 8) replaced this.

---

## Phase 8: Platform Migration `completed`

> Jan 31 – Feb 6, 2026

- [x] Replace Google Sheets with PostgreSQL (Neon) + Drizzle ORM
- [x] GraphQL API with Apollo Server (accounts, budgets, categories, allocations, transactions)
- [x] Next.js 15 web UI with ShadCN, Tailwind, Apollo Client
- [x] Budget page with inline editing, move funds, CRUD dialogs
- [x] Accounts page with CRUD for manual accounts
- [x] Categories management page
- [x] Transaction detail/edit panel with auto-verify on edit
- [x] Basic auth gate for single-user access
- [x] E2E tests with Playwright, Page Object Model
- [x] Deploy web frontend to Cloud Run

---

## Phase 9: Transaction UI Improvements & Data Correctness `not started`

> Backend context: [`claude_plans/split-bank-transactions-and-transactions.md`](claude_plans/split-bank-transactions-and-transactions.md) (implemented)

The bank_transactions / transactions split is implemented and working. This phase covers UI improvements and ensuring all production data is correctly processed.

### Problem 1: Fee + main transaction display

When a bank transaction has a commission (e.g., transfer fee), it creates two logical transactions: the main payment and a fee. On the UI, the fee row shows as "Bank" with no category or budget — it needs auto-categorization or additional context sent to the LLM for categorization.

**Example:** "Bank" row (fee) next to "Марія тренерка Соломії" (main) — fee has no category/budget, requires manual assignment.

### Problem 2: Returnings rendered as separate rows

A partial return (e.g., "Скасування. ОККО") creates a returning transaction linked to the original. Currently both show as independent rows on the UI. Should be **one row** showing the original transaction with a "partially returned" indicator, the returned amount, and both bank transactions visible in the detail panel.

**Example:** "Скасування. ОККО" (+268.12) and "ОККО" (-3519.45) show as two rows. Should be one row with net amount and a return indicator.

### Problem 3: Transfers need better display and no categorization

Transfer pairs show as two rows with mismatched names ("Переказ на картку" vs "З Білої картки"), both prompting for category and budget. Transfers should have consistent naming, no category/budget prompts, and no verification needed. The "Categorized" warning badge should not appear on transfers.

**Example:** Two transfer rows both showing "Add category", "Add budget", and a "Categorized" warning badge despite being correctly detected as transfers.

### Tasks

- [ ] **Audit production data** — check all prod transactions for edge cases beyond the three examples above, verify detection rules and backfill handled everything correctly
- [ ] **Fee transactions** — auto-categorize fee transactions or provide better context to LLM for categorization
- [ ] **Returnings UI** — render returning + original as a single row, show return amount and indicator, show both bank transactions in detail panel
- [ ] **Transfers UI** — consistent naming for both sides, hide category/budget prompts, remove "Categorized" warning badge, skip verification
- [ ] **Type filter** — add TRANSFER and RETURNING options to transaction filter sidebar

---

## Phase 10: Categorization Rules & Verification UI `not started`

> Previously Phase 9

### Verification panel
- [ ] Quick-verify panel for categorized transactions — review queue with one-click approve or inline edit (category, budget)
- [ ] Quick-categorize panel for uncategorized transactions — same UI, assign category/budget or skip
- [ ] Batch actions — verify all, filter by date/account/status

### Rules management
- [ ] Deterministic rules form builder — visual condition editor on UI:
  - Build conditions on transaction fields (description contains, amount >, MCC equals, etc.)
  - Combine conditions with AND/OR logic
  - Assign category and/or budget when conditions match
  - Priority ordering — rules evaluated before LLM
- [ ] AI rules editor — plaintext prompt editing for LLM-based rules (categories and budgets)
- [ ] Unified rules management UI — single place to view/edit both deterministic and AI rules

### Smart rule suggestions `future`
- [ ] Detect patterns when user overrides categorization (e.g., always re-assigns a certain description)
- [ ] Auto-generate suggested deterministic rules from these patterns
- [ ] Present suggestions for user approval before adding to active rules

---

## Phase 11: Telegram Bot `not started`

- [ ] Telegram bot for push notifications (new transactions, uncategorized alerts)
- [ ] Record spendings for manual accounts via chat
- [ ] Transaction review and approval via chat (approve, categorize, reject)
- [ ] Quick natural language commands ("Spent 500 on groceries", "Show uncategorized")

---

## Phase 12: AI-Native Interface `not started`

- [ ] Natural language input on web UI (text field + voice dictation)
- [ ] Agent with tools that interprets user intent and performs operations:
  - Record cash transactions
  - Bulk-update transaction statuses
  - Categorize/re-categorize transactions
  - Query spending summaries
  - Any operation available through the app
- [ ] Tool/action confirmation before execution

---

## Phase 13: Custom Dashboard `not started`

- [ ] Chart builder — create charts from available data (transactions, budgets, categories, accounts)
- [ ] Supported chart types: column, pie, flow/river (Sankey), line, etc.
- [ ] Drag-and-drop layout — user arranges charts freely on a canvas
- [ ] Save/load dashboards — persist custom layouts per user
- [ ] New chart types added in code, instantly available to users in the builder

---

## Short-term Tasks

Small but important items, not tied to a specific phase:

- [ ] **Audit budget fund movement** — validate month-to-month fund transfers work correctly for all budget types (spending, savings, debt). Investigate and fix if needed.
- [ ] **Manual transaction UI** — add form on web UI to create transactions for manual (non-synced) accounts
- [ ] **Spreadsheet cleanup** — remove Google Sheets dependency (code, modules, scripts, credentials) now that PostgreSQL is primary
- [x] **Database migration US → EU** — migrated Neon database from New York (`aws-us-west-2`) to Frankfurt (`aws-eu-central-1`), closer to Cloud Run in Warsaw. Data copied via pg_dump/restore, GCP secret updated, services redeployed.
- [ ] **Runtime env vars & production E2E** — remove `NEXT_PUBLIC_*` bundled env vars in favor of runtime configuration (follow 12-factor app). Build a single Docker image and run E2E tests against it instead of dev mode. Enables: same image for dev/staging/prod with different env vars, eliminates dev-server warm-up hacks in CI, makes E2E closer to production behavior.

---

## Future / Deferred

Low priority or blocked by other work:

- [ ] **Move database to GCP** — self-hosted or Cloud SQL PostgreSQL (postponed — cost consideration)
- [ ] **WebSocket subscriptions** — Apollo subscriptions for real-time UI updates (blocked: Cloud Run is request-based; needs migration to persistent server)
- [ ] **Mobile app** — standalone mobile app for transaction management
