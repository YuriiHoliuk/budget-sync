# Known Issues & Future Improvements

## 1. Spreadsheet Row Loading - Memory & Performance

**Problem:** When finding rows (e.g., `findByExternalId`, `findByExternalIds`), we load ALL rows from the spreadsheet into memory. As the transaction count grows (thousands/tens of thousands), this becomes:
- Time consuming (slow API calls)
- RAM consuming (may not fit in memory)
- Inefficient (loading everything to find a few rows)

**Affected operations:**
- `SpreadsheetTransactionRepository.findByExternalIds()` - called for deduplication on every sync
- `SpreadsheetTransactionRepository.findByExternalId()`
- Any `findBy()` / `findAllBy()` operations

**Potential fixes:**

### Option A: Chunked Reading
Read rows in chunks (e.g., 1000 at a time) instead of all at once:
```typescript
async findByExternalIds(externalIds: string[]): Promise<Map<string, Transaction>> {
  const result = new Map();
  const idSet = new Set(externalIds);

  let offset = 0;
  const chunkSize = 1000;

  while (true) {
    const rows = await this.table.readRows({ offset, limit: chunkSize });
    if (rows.length === 0) break;

    for (const row of rows) {
      if (idSet.has(row.externalId)) {
        result.set(row.externalId, this.toEntity(row));
      }
    }
    offset += chunkSize;
  }

  return result;
}
```

### Option B: In-Memory Cache
Cache external IDs in memory after first load, invalidate on writes:
```typescript
class SpreadsheetTransactionRepository {
  private externalIdCache: Set<string> | null = null;

  async findByExternalIds(externalIds: string[]): Promise<Map<string, Transaction>> {
    if (!this.externalIdCache) {
      // Load only external IDs (single column) - much smaller
      this.externalIdCache = await this.loadExternalIdColumn();
    }

    // Quick check against cache
    const existingIds = externalIds.filter(id => this.externalIdCache!.has(id));
    // Only load full rows for existing IDs
    ...
  }

  async saveMany(transactions: Transaction[]): Promise<void> {
    await super.saveMany(transactions);
    // Invalidate cache
    for (const tx of transactions) {
      this.externalIdCache?.add(tx.externalId);
    }
  }
}
```

### Option C: Read Only Recent Rows
For deduplication, only read last N rows (e.g., last 1000) since duplicates are likely recent:
```typescript
async findByExternalIds(externalIds: string[]): Promise<Map<string, Transaction>> {
  // Only check last 1000 rows for duplicates
  const recentRows = await this.table.readRows({
    offset: -1000,  // Last 1000 rows
    limit: 1000
  });
  // ... filter by externalIds
}
```

### Option D: External Index/Database
For very large datasets, maintain a separate index (SQLite, JSON file) with externalId → rowNumber mapping.

---

## 2. Rate Limiting Relies on Delays

**Problem:** Current implementation uses fixed delays between API requests. If Monobank changes rate limits or we guess wrong, syncs may fail or be unnecessarily slow.

**Current behavior:** 5-second delay between requests, exponential backoff on 429 errors.

**Potential improvement:** Adaptive rate limiting - start with no delay, detect 429 errors, and dynamically adjust delay.

---

## 3. No Progress Indication for Long Syncs

**Problem:** When syncing many transactions over long periods, users see no progress until completion.

**Potential fix:** Add progress callbacks or emit events during sync.

---


## 5. Improve testing coverage (Partially Done)

**Problem:** We have unit tests for simplest things only and integration for real API (2 of them).

**Done:**
- Unit tests for use cases: SyncMonobank, SyncTransactions, SyncAccounts
- Unit tests for domain entities: Transaction, Account
- Unit tests for infrastructure: MonobankGateway, AccountNameResolver
- Unit tests for modules: BaseLogger, delay utility
- Total: 364 tests across 15 files

**Remaining:**
- Add "e2e" tests with test spreadsheet and mocked Monobank API
- Consider adding unit tests for spreadsheet repositories (currently covered by integration tests)

## 6. Use something like appConfig and avoid using env directly everywhere.

## 7. File/Folder structure.

**Problem:** We structure not by domain/modules but by type of entity (use-cases, repositories, gateways, dockerfiles, etc.).
I find this approach worse but now it works fine. In case if not need to think about restructuring.
E.g. structure per module/domain/topic, etc. And have use-case, services, repositories for similar purposes close by.

## 8. Static analysis should ensure layers structure and other project guidelines.

## 9. Need way to write Jobs, Handlers, CLI commands as classes with DI and testing.
More: commands have logic in action, should use something, like Command class or so.
great we have server class, controller class, which injects use-cases. But we also have main file that uses server class. And all together looks too much.
Jobs are just main + some functions, looks like a mess.

## 10. Manual deploy for new things.
I see the issue - Terraform creates the resources but needs an existing image. The Deploy workflow runs after CI and updates existing resources. For new resources, we need to build/push the image first.

How can we avoid that?
