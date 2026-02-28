# Users & Plans — Data Model Brainstorm

## The Core Question: What's Shared, What's Personal?

Currently everything is implicitly single-user. The challenge is drawing the right boundary between **user-owned** and **plan-owned** data.

### "Plan" as the shared unit

"Plan" works well — it's neutral for solo users ("My Budget Plan") and intuitive for sharing ("Family Plan"). Alternatives: Space, Book, Ledger. Avoid "Budget" since it collides with the envelope entity.

### Data ownership model

| **User-scoped (personal)** | **Plan-scoped (shared)** |
|---|---|
| Profile, email, auth, sessions | Accounts |
| Bank connections (Monobank tokens) | Transactions + Bank transactions |
| Preferences / settings | Categories (hierarchical) |
| Plan memberships | Budgets, Budget groups, Budget targets |
| | Allocations |
| | Categorization & Budgetization rules |

### Why accounts belong to the Plan, not the User

This is the key decision. Reasons:

1. **"Ready to Assign"** = sum of all operational account balances minus total allocated. This calculation needs all accounts in one plan.
2. **Budget spending** references transactions which reference accounts — the whole chain needs to live in one plan.
3. Partners need to see each other's accounts and transactions in a shared budget view.
4. Categories and budget assignments are plan-specific context.

The **bank connection** (Monobank token) stays user-level — it's your personal API key. But it syncs *into* a specific plan.

---

## The Hard Problem: One Account, Multiple Plans?

Scenario: You have a personal credit card. You also share a family plan with your partner. Some purchases on your card are household expenses.

**Three approaches:**

| Approach | Complexity | UX |
|---|---|---|
| **Account-level**: each account belongs to exactly one plan | Low | Limiting — forces you to pick one plan per account |
| **Transaction-level splitting**: account in one plan, individual transactions can be "sent" to another | High | Most flexible but complex |
| **Account linking**: account lives in one plan, read-only mirror in another | Medium | Good visibility, unclear budget assignment |

**Recommendation: start with account-level assignment.** Most couples with shared finances have:
- Joint accounts → shared plan
- Personal accounts → personal plan (or no personal plan at all)

If someone needs to track a household expense from a personal card, they can create a manual transaction or a transfer in the shared plan. Multi-plan splitting is a future optimization.

---

## Proposed Schema (New Tables)

```sql
users
  id              SERIAL PK
  email           TEXT UNIQUE NOT NULL
  name            TEXT
  avatar_url      TEXT
  created_at      TIMESTAMP
  updated_at      TIMESTAMP

plans
  id              SERIAL PK
  name            TEXT NOT NULL        -- "My Budget", "Family Budget"
  created_at      TIMESTAMP
  updated_at      TIMESTAMP

plan_members
  id              SERIAL PK
  plan_id         FK → plans
  user_id         FK → users
  role            TEXT NOT NULL        -- 'owner' | 'editor' | 'viewer'
  created_at      TIMESTAMP
  UNIQUE(plan_id, user_id)

bank_connections                       -- replaces env var MONOBANK_TOKEN
  id              SERIAL PK
  user_id         FK → users           -- who owns the token
  plan_id         FK → plans           -- which plan to sync into
  provider        TEXT NOT NULL         -- 'monobank'
  token           TEXT NOT NULL         -- encrypted
  created_at      TIMESTAMP
```

### Existing tables gain `plan_id`

- `accounts.plan_id` → FK plans
- `categories.plan_id` → FK plans
- `budgets.plan_id` → FK plans
- `budget_groups.plan_id` → FK plans
- `categorization_rules.plan_id` → FK plans
- `budgetization_rules.plan_id` → FK plans

### Tables that DON'T need `plan_id` directly (reachable via FK chain)

- `transactions` → via `account_id` → plan
- `bank_transactions` → via `account_id` → plan
- `allocations` → via `budget_id` → plan
- `budget_targets` → via `budget_id` → plan
- `transfer_pairs`, `transaction_sources`, `bank_transaction_returns` → via transactions

---

## Migration Strategy for Existing Data

```sql
-- 1. Create new tables (users, plans, plan_members, bank_connections)
-- 2. Create default user (from current NEXT_PUBLIC_ALLOWED_EMAIL)
-- 3. Create default plan ("My Budget")
-- 4. Create plan_member(plan, user, 'owner')
-- 5. UPDATE accounts SET plan_id = <default_plan_id>
-- 6. UPDATE categories SET plan_id = <default_plan_id>
-- 7. UPDATE budgets SET plan_id = <default_plan_id>
-- 8. UPDATE budget_groups SET plan_id = <default_plan_id>
-- 9. UPDATE categorization_rules SET plan_id = <default_plan_id>
-- 10. UPDATE budgetization_rules SET plan_id = <default_plan_id>
-- 11. ALTER all plan_id columns to NOT NULL
```

Existing single-user experience is preserved — everything belongs to one user's one plan.

---

## Open Questions

1. **Multiple plans per user from day one?** Or is v1 just "one user has one plan, can invite others"? Multiple plans adds complexity (plan switcher UI, choosing which plan to sync into, etc.)

2. **Bank connections in DB vs env var.** Currently `MONOBANK_TOKEN` is an env var. Moving to DB means encryption, UI for managing connections, and changing the sync flow. Could defer this — keep env var for now, hardcode it to the default user's connection.

3. **Exchange rates** — global (same for all plans) or per-plan? They're objective data. Keep them global (no plan_id).

4. **Permissions granularity** — is `owner | editor | viewer` enough? Or finer control (e.g., can edit budgets but not see account balances)?

5. **Plan deletion / leaving** — when a user leaves a shared plan, their bank connection stops syncing into it. But their historical transactions remain (they're plan data now). Is that acceptable?

---

## Suggested Implementation Order

1. **Schema changes** — add users, plans, plan_members tables + plan_id columns, migration for existing data
2. **Domain layer** — User, Plan, PlanMember entities and repositories
3. **Query scoping** — all existing queries filter by plan_id (biggest change — every repository method needs plan context)
4. **Auth** — real user authentication (replaces basic auth gate)
5. **Plan management UI** — create plan, invite, accept
6. **Bank connections** — move token to DB, associate with user + plan

Steps 1-3 are the data foundation. Steps 4-6 are the user-facing features.
