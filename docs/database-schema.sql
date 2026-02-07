-- Budget Sync Database Schema
-- Target: PostgreSQL (Neon Serverless or Cloud SQL)
-- Version: 2.0
--
-- YNAB-style envelope budgeting with independent categories.
-- Pure computation model: no monthly budget records, all balances derived
-- from allocations + transactions.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-----------------------------------------------------------
-- ACCOUNTS
-- Bank accounts synced from Monobank
-----------------------------------------------------------
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(255) UNIQUE,  -- Bank account ID (deduplication)

    -- Display fields
    name VARCHAR(255),                 -- User-defined name
    external_name VARCHAR(255),        -- Bank-provided name

    -- Account details
    type VARCHAR(50) NOT NULL,         -- 'debit', 'credit', 'fop'
    currency VARCHAR(3) NOT NULL,      -- ISO 4217 code
    balance BIGINT NOT NULL DEFAULT 0, -- Minor units (kopecks)
    initial_balance BIGINT,            -- Balance when account was first added (kopecks)
    role VARCHAR(50) NOT NULL,         -- 'operational' (spending) or 'savings'
    credit_limit BIGINT DEFAULT 0,     -- For credit cards

    -- Bank details
    iban VARCHAR(34) UNIQUE,
    bank VARCHAR(100),                 -- e.g., 'monobank'

    -- Sync tracking
    last_sync_time TIMESTAMP WITH TIME ZONE,

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_accounts_bank ON accounts(bank);
CREATE INDEX idx_accounts_role ON accounts(role);

COMMENT ON TABLE accounts IS 'Bank accounts synced from Monobank';
COMMENT ON COLUMN accounts.balance IS 'Balance in minor units (kopecks). For credit cards: actual balance (balance - creditLimit)';
COMMENT ON COLUMN accounts.type IS 'Account type: debit, credit, fop';
COMMENT ON COLUMN accounts.role IS 'Account role: operational (daily spending, included in available funds) or savings (capital, excluded from budgeting)';

-----------------------------------------------------------
-- CATEGORIES
-- Transaction classification with optional hierarchy.
-- Independent from budgets — a transaction has both.
-----------------------------------------------------------
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active', 'suggested', 'archived'

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_categories_status ON categories(status);
CREATE INDEX idx_categories_parent ON categories(parent_id);

COMMENT ON TABLE categories IS 'Transaction categories (what a transaction IS). Independent from budgets (where money comes FROM).';
COMMENT ON COLUMN categories.status IS 'active = user-confirmed, suggested = LLM-created, archived = deprecated';

-----------------------------------------------------------
-- BUDGETS
-- YNAB-style envelopes. Each budget has a type that
-- determines rollover behavior and target calculation.
--
-- Types:
--   spending  — monthly budget, positive resets, negative carries
--   savings   — monthly contribution, everything accumulates
--   goal      — save toward total amount by target date
--   periodic  — save toward bill amount on a cadence
-----------------------------------------------------------
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,

    -- Budget behavior
    type VARCHAR(20) NOT NULL,         -- 'spending', 'savings', 'goal', 'periodic'
    currency VARCHAR(3) NOT NULL,      -- ISO 4217 code

    -- Target configuration (lives on budget, no separate table)
    target_amount BIGINT NOT NULL,     -- Minor units: monthly limit (spending/savings) or total target (goal/periodic)
    target_cadence VARCHAR(20),        -- 'monthly', 'yearly', 'custom' (for periodic type)
    target_cadence_months INTEGER,     -- Custom interval in months (e.g., 3 = quarterly)
    target_date DATE,                  -- Due date for goal/periodic, NULL for spending/savings

    -- Lifecycle
    start_date DATE,                   -- NULL = always active
    end_date DATE,                     -- NULL = ongoing
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_budget_type CHECK (type IN ('spending', 'savings', 'goal', 'periodic')),
    CONSTRAINT valid_target_cadence CHECK (target_cadence IS NULL OR target_cadence IN ('monthly', 'yearly', 'custom')),
    CONSTRAINT periodic_requires_cadence CHECK (type != 'periodic' OR target_cadence IS NOT NULL)
);

CREATE INDEX idx_budgets_type ON budgets(type);
CREATE INDEX idx_budgets_dates ON budgets(start_date, end_date);
CREATE INDEX idx_budgets_active ON budgets(is_archived) WHERE is_archived = FALSE;

COMMENT ON TABLE budgets IS 'YNAB-style budget envelopes. Type determines rollover and target behavior.';
COMMENT ON COLUMN budgets.type IS 'spending = resets monthly, savings = accumulates, goal = save toward amount, periodic = save toward recurring bill';
COMMENT ON COLUMN budgets.target_amount IS 'Minor units. For spending/savings: monthly amount. For goal/periodic: total target amount.';
COMMENT ON COLUMN budgets.target_date IS 'When the money is needed. For goal: one-off deadline. For periodic: next due date.';

-----------------------------------------------------------
-- ALLOCATIONS
-- Envelope budgeting: each row assigns funds to a budget
-- for a specific month. This is the single source of truth
-- for all budget balances (pure computation model).
--
-- Moving money between budgets = negative allocation on
-- source + positive allocation on destination.
--
-- Future month allocations supported via period field.
-----------------------------------------------------------
CREATE TABLE allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,            -- Minor units; positive = add, negative = remove
    period VARCHAR(7) NOT NULL,        -- YYYY-MM format (e.g., '2026-02')
    date DATE NOT NULL,                -- When allocation was made
    notes TEXT,                        -- Optional notes

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_allocations_budget_id ON allocations(budget_id);
CREATE INDEX idx_allocations_period ON allocations(period);
CREATE INDEX idx_allocations_budget_period ON allocations(budget_id, period);

COMMENT ON TABLE allocations IS 'Envelope budgeting allocations. Single source of truth — all balances computed from this table + transactions.';
COMMENT ON COLUMN allocations.amount IS 'Amount in minor units. Positive = allocate funds, Negative = remove/move funds.';
COMMENT ON COLUMN allocations.period IS 'Target month in YYYY-MM format. Can be a future month for advance budgeting.';

-----------------------------------------------------------
-- TRANSACTIONS
-- All financial transactions from bank accounts.
-- Each transaction references BOTH a category (what it IS)
-- and a budget (which envelope the money comes from).
-----------------------------------------------------------
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(255) UNIQUE,   -- Bank transaction ID (deduplication)

    -- Core fields
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    amount BIGINT NOT NULL,            -- Minor units, signed (+credit, -debit)
    currency VARCHAR(3) NOT NULL,      -- ISO 4217 code
    type VARCHAR(10) NOT NULL,         -- 'credit', 'debit'

    -- Account reference
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    account_external_id VARCHAR(255),  -- For lookup before account creation

    -- Categorization (independent dimensions)
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,  -- What it IS
    budget_id UUID REFERENCES budgets(id) ON DELETE SET NULL,       -- Where money comes FROM
    categorization_status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'categorized', 'verified'
    category_reason TEXT,              -- LLM explanation
    budget_reason TEXT,                -- LLM explanation

    -- Bank-provided data
    mcc INTEGER,                       -- Merchant Category Code
    original_mcc INTEGER,              -- Original MCC before bank correction
    bank_category VARCHAR(255),        -- Bank's category
    bank_description TEXT,             -- Bank's description

    -- Counterparty info
    counterparty VARCHAR(255),         -- Merchant/recipient name
    counterparty_iban VARCHAR(34),     -- IBAN of counterparty
    counter_edrpou VARCHAR(20),        -- Ukrainian tax ID

    -- Financial details
    balance_after BIGINT,              -- Account balance after transaction
    operation_amount BIGINT,           -- Original amount (for forex)
    operation_currency VARCHAR(3),     -- Original currency
    cashback BIGINT DEFAULT 0,         -- Cashback earned
    commission BIGINT DEFAULT 0,       -- Fees paid
    hold BOOLEAN DEFAULT FALSE,        -- Authorization hold

    -- References
    receipt_id VARCHAR(255),           -- check.gov.ua receipt
    invoice_id VARCHAR(255),           -- Invoice ID (FOP)

    -- User fields
    tags TEXT[],                       -- Array of user tags
    notes TEXT,                        -- User notes
    exclude_from_calculations BOOLEAN DEFAULT FALSE,  -- Exclude from budget calculations

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Critical indexes for performance
-- Note: external_id already has UNIQUE constraint (implicit index)
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_account_external_id ON transactions(account_external_id);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_budget_id ON transactions(budget_id);
CREATE INDEX idx_transactions_categorization_status ON transactions(categorization_status);
CREATE INDEX idx_transactions_counterparty ON transactions(counterparty);
CREATE INDEX idx_transactions_type ON transactions(type);

-- Composite indexes for common query patterns
CREATE INDEX idx_transactions_date_category ON transactions(date, category_id);
CREATE INDEX idx_transactions_date_budget ON transactions(date, budget_id);
CREATE INDEX idx_transactions_account_date ON transactions(account_id, date);

-- For efficient monthly aggregations
CREATE INDEX idx_transactions_year_month ON transactions(
    EXTRACT(YEAR FROM date),
    EXTRACT(MONTH FROM date)
);

COMMENT ON TABLE transactions IS 'Financial transactions synced from bank accounts';
COMMENT ON COLUMN transactions.amount IS 'Amount in minor units (kopecks). Positive = credit/income, Negative = debit/expense';
COMMENT ON COLUMN transactions.category_id IS 'What the transaction IS (e.g., Food > Supermarket). Independent from budget.';
COMMENT ON COLUMN transactions.budget_id IS 'Which envelope the money comes from (e.g., Groceries budget). Independent from category.';
COMMENT ON COLUMN transactions.categorization_status IS 'pending = awaiting categorization, categorized = LLM assigned, verified = user confirmed';

-----------------------------------------------------------
-- TRANSACTION LINKS
-- Links between related transactions (transfers, splits, refunds).
-- Uses a join table pattern to support N:M relationships.
--
-- Types:
--   transfer — money moved between accounts (source → incoming)
--   split    — single payment split across budgets (source → parts)
--   refund   — returned payment (source → refund)
-----------------------------------------------------------
CREATE TABLE transaction_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    link_type VARCHAR(20) NOT NULL,
    notes TEXT,

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_link_type CHECK (link_type IN ('transfer', 'split', 'refund'))
);

CREATE TABLE transaction_link_members (
    link_id UUID REFERENCES transaction_links(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,

    PRIMARY KEY (link_id, transaction_id),
    CONSTRAINT valid_member_role CHECK (role IN ('source', 'outgoing', 'incoming', 'part', 'refund'))
);

CREATE INDEX idx_transaction_links_type ON transaction_links(link_type);
CREATE INDEX idx_transaction_link_members_transaction ON transaction_link_members(transaction_id);

COMMENT ON TABLE transaction_links IS 'Groups of related transactions (transfers, splits, refunds)';
COMMENT ON COLUMN transaction_links.link_type IS 'transfer = between accounts, split = across budgets, refund = returned payment';
COMMENT ON TABLE transaction_link_members IS 'Join table linking transactions to their relationship group';
COMMENT ON COLUMN transaction_link_members.role IS 'source = original transaction, outgoing/incoming = transfer legs, part = split portion, refund = return';

-----------------------------------------------------------
-- CATEGORIZATION RULES
-- User-defined rules for LLM transaction categorization
-----------------------------------------------------------
CREATE TABLE categorization_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule TEXT NOT NULL,                -- Free-form rule text for LLM
    priority INTEGER DEFAULT 0,        -- Higher = applied first

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE categorization_rules IS 'User-defined rules for LLM-based transaction categorization';
COMMENT ON COLUMN categorization_rules.rule IS 'Free-form text rule, e.g., "All payments to SuperMarket should be Food"';

-----------------------------------------------------------
-- BUDGETIZATION RULES
-- User-defined rules for LLM budget assignment
-----------------------------------------------------------
CREATE TABLE budgetization_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule TEXT NOT NULL,                -- Free-form rule text for LLM
    priority INTEGER DEFAULT 0,        -- Higher = applied first

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE budgetization_rules IS 'User-defined rules for LLM-based budget assignment';
COMMENT ON COLUMN budgetization_rules.rule IS 'Free-form text rule, e.g., "All subscriptions should be Subscriptions budget"';

-----------------------------------------------------------
-- EXCHANGE RATES (Optional)
-- Historical exchange rates for currency conversion
-----------------------------------------------------------
CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    currency VARCHAR(3) NOT NULL,      -- ISO 4217 code
    rate DECIMAL(18, 8) NOT NULL,      -- Rate to UAH

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(date, currency)
);

CREATE INDEX idx_exchange_rates_date ON exchange_rates(date);
CREATE INDEX idx_exchange_rates_currency ON exchange_rates(currency);

COMMENT ON TABLE exchange_rates IS 'Historical exchange rates from NBU for currency conversion';

-----------------------------------------------------------
-- AUTO-UPDATE TRIGGERS
-- Automatically update updated_at timestamp
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budgets_updated_at
    BEFORE UPDATE ON budgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categorization_rules_updated_at
    BEFORE UPDATE ON categorization_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budgetization_rules_updated_at
    BEFORE UPDATE ON budgetization_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_allocations_updated_at
    BEFORE UPDATE ON allocations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-----------------------------------------------------------
-- FUTURE: MULTI-USER SUPPORT
-- Uncomment when adding user authentication
-----------------------------------------------------------
/*
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add user_id foreign keys to all tables:
ALTER TABLE accounts ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE categories ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE budgets ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE categorization_rules ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE budgetization_rules ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Add indexes for user filtering
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_budgets_user_id ON budgets(user_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_categorization_rules_user_id ON categorization_rules(user_id);
CREATE INDEX idx_budgetization_rules_user_id ON budgetization_rules(user_id);
*/

-----------------------------------------------------------
-- SAMPLE QUERIES
-- Common query patterns for reference
-----------------------------------------------------------

-- === READY TO ASSIGN ===
-- Unallocated money = operational balances - total allocations
--
-- SELECT
--     (SELECT COALESCE(SUM(balance), 0) FROM accounts WHERE role = 'operational')
--     - (SELECT COALESCE(SUM(amount), 0) FROM allocations)
--     AS ready_to_assign;

-- === BUDGET AVAILABLE BALANCE (for month $1 = 'YYYY-MM') ===
-- Spending: allocated(month) - spent(month) + negative carryover from prior months
-- Savings/Goal/Periodic: SUM(all allocated) - SUM(all spent)
--
-- SELECT
--     b.id, b.name, b.type, b.target_amount,
--     COALESCE(alloc.total, 0) as allocated,
--     COALESCE(spent.total, 0) as spent,
--     COALESCE(alloc.total, 0) - COALESCE(spent.total, 0) as available
-- FROM budgets b
-- LEFT JOIN LATERAL (
--     SELECT SUM(a.amount) as total FROM allocations a
--     WHERE a.budget_id = b.id
--     AND CASE WHEN b.type = 'spending' THEN a.period = $1
--          ELSE a.period <= $1 END
-- ) alloc ON TRUE
-- LEFT JOIN LATERAL (
--     SELECT SUM(ABS(t.amount)) as total FROM transactions t
--     WHERE t.budget_id = b.id AND t.amount < 0
--     AND CASE WHEN b.type = 'spending'
--          THEN t.date >= ($1 || '-01')::date
--               AND t.date < (($1 || '-01')::date + INTERVAL '1 month')
--          ELSE t.date < (($1 || '-01')::date + INTERVAL '1 month') END
-- ) spent ON TRUE
-- WHERE b.is_archived = FALSE;

-- === SPENDING BUDGET WITH NEGATIVE CARRYOVER ===
-- For spending budgets, negative balance from prior months carries forward.
-- This requires computing prior months' balances recursively.
--
-- WITH monthly_balance AS (
--     SELECT
--         period,
--         COALESCE(SUM(a.amount), 0) as allocated,
--         COALESCE((
--             SELECT SUM(ABS(t.amount)) FROM transactions t
--             WHERE t.budget_id = $budget_id AND t.amount < 0
--             AND t.date >= (period || '-01')::date
--             AND t.date < ((period || '-01')::date + INTERVAL '1 month')
--         ), 0) as spent
--     FROM generate_series(
--         (SELECT MIN(period) FROM allocations WHERE budget_id = $budget_id),
--         $1,
--         '1 month'::interval
--     ) AS period_series(period)
--     LEFT JOIN allocations a ON a.budget_id = $budget_id
--         AND a.period = TO_CHAR(period_series.period, 'YYYY-MM')
--     GROUP BY period
-- )
-- -- Then use a window function to accumulate negative carryover

-- === MOVE MONEY BETWEEN BUDGETS ===
-- Create two allocations: negative on source, positive on destination
--
-- INSERT INTO allocations (budget_id, amount, period, date, notes) VALUES
--     ($source_budget_id, -5000, '2026-02', CURRENT_DATE, 'Move to Dining'),
--     ($dest_budget_id,    5000, '2026-02', CURRENT_DATE, 'Move from Groceries');

-- === MONTHLY CATEGORY BREAKDOWN ===
--
-- SELECT c.name, SUM(ABS(t.amount)) as total
-- FROM transactions t
-- LEFT JOIN categories c ON t.category_id = c.id
-- WHERE t.date >= '2026-01-01' AND t.date < '2026-02-01'
--   AND t.amount < 0
-- GROUP BY c.name
-- ORDER BY total DESC;

-- === CATEGORY HIERARCHY (recursive CTE) ===
--
-- WITH RECURSIVE category_path AS (
--     SELECT id, name, parent_id, name::text as path
--     FROM categories WHERE parent_id IS NULL
--     UNION ALL
--     SELECT c.id, c.name, c.parent_id, cp.path || ' > ' || c.name
--     FROM categories c
--     JOIN category_path cp ON c.parent_id = cp.id
-- )
-- SELECT * FROM category_path;

-- === DASHBOARD: MONTHLY TOTALS (last 6 months) ===
--
-- SELECT
--     DATE_TRUNC('month', date) as month,
--     SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as expenses,
--     SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income
-- FROM transactions
-- WHERE date >= DATE_TRUNC('month', NOW()) - INTERVAL '6 months'
-- GROUP BY DATE_TRUNC('month', date)
-- ORDER BY month;

-- === GOAL PROGRESS ===
-- How much saved toward a goal budget's target
--
-- SELECT
--     b.name,
--     b.target_amount,
--     b.target_date,
--     COALESCE(SUM(a.amount), 0) as total_allocated,
--     COALESCE(SUM(ABS(t.amount)), 0) as total_spent,
--     COALESCE(SUM(a.amount), 0) - COALESCE(SUM(ABS(t.amount)), 0) as saved,
--     b.target_amount - (COALESCE(SUM(a.amount), 0) - COALESCE(SUM(ABS(t.amount)), 0)) as remaining
-- FROM budgets b
-- LEFT JOIN allocations a ON a.budget_id = b.id
-- LEFT JOIN transactions t ON t.budget_id = b.id AND t.amount < 0
-- WHERE b.type IN ('goal', 'periodic')
--   AND b.is_archived = FALSE
-- GROUP BY b.id, b.name, b.target_amount, b.target_date;
