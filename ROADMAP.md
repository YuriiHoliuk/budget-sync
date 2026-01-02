# Budget Sync Roadmap

## Phase 1: Cloud Deployment

- [ ] Set up CI/CD pipeline (GitHub Actions → Google Cloud)
- [ ] Deploy system to Google Cloud
- [ ] Set up stable URL (Google Cloud Functions or Cloud Run)
- [ ] Configure cron job for transaction polling (temporary solution)

---

## Phase 2: Spreadsheet Data Model

- [ ] Create **Categories** sheet — list of spending/income categories
- [ ] Create **Rules** sheet — deterministic categorization rules:
  - Bank description pattern → Category
  - Category → Budget mapping
  - Bidirectional inference (category implies budget, budget implies category)
- [ ] Create **Budget Allocations** sheet — planned savings for future expenses:
  - Yearly or one-time budgets (e.g., vacation, insurance, big purchases)
  - Monthly allocation amounts to accumulate before spending
  - Track allocated vs spent per budget goal

---

## Phase 3: Transaction Categorization

### Deterministic Rules Engine
- [ ] Implement rule-based categorization using Rules sheet
- [ ] Apply rules automatically during transaction sync

### AI Fallback
- [ ] Implement LLM-based categorization for unmatched transactions
- [ ] Use AI to infer category, budget, and account from transaction context

---

## Phase 4: Real-time Sync

- [ ] Set up Monobank webhooks for instant transaction updates
- [ ] Expose HTTP endpoints to receive webhook payloads
- [ ] Remove dependency on polling (keep as fallback)

---

## Phase 5: Chat Interface

- [ ] Implement Telegram, WhatsApp bot, or standalone mobile app
- [ ] Support quick transaction input via voice/text:
  - "Spent 500 on groceries" → auto-categorize and log
  - Cash transactions (no bank account) → AI infers category
- [ ] Support transaction review and approval:
  - "Show uncategorized transactions"
  - "That 1500 UAH was for utilities" → categorize via chat

---

## Phase 6: Review System

- [ ] Build review workflow for uncategorized/uncertain transactions
- [ ] Allow approve, edit, or re-categorize via chat or CLI
- [ ] Batch review support for multiple transactions

---

## Phase 7: Spreadsheet Improvements

- [ ] Format and style data sheets
- [ ] Create **Dashboard** sheet with summary formulas:
  - Monthly spending by category
  - Budget vs actual comparison
  - Income/expense trends

---

## Phase 8: Future Enhancements

- [ ] Replace Google Sheets with proper database (PostgreSQL)
- [ ] Build web UI dashboard (or use Observable HQ)
- [ ] Standalone mobile app for transaction management
