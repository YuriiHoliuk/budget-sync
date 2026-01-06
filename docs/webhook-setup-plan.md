# Monobank Webhook Implementation Plan

## Overview

Implement real-time transaction notifications from Monobank using webhooks with a queue-based architecture for reliability.

**Architecture:**
```
Monobank → Cloud Run Service (webhook) → Pub/Sub → Cloud Run Job (processor) → Spreadsheet
```

**Key Features:**
- GET/POST `/webhook` endpoint (public, no auth)
- Google Cloud Pub/Sub for reliable message queuing
- Dead letter queue for failed messages
- CLI command to register webhook URL with Monobank

---

## Implementation Tasks

> **Note:** Each subtask below should be implemented by a separate subagent to keep context clean.

### Task 1: Pub/Sub Module

Create a reusable module wrapping Google Cloud Pub/Sub client.

**Files to create:**
- `src/modules/pubsub/PubSubClient.ts` - Publish/pull operations
- `src/modules/pubsub/types.ts` - Message types
- `src/modules/pubsub/errors.ts` - PubSub-specific errors
- `src/modules/pubsub/index.ts` - Exports

**Dependencies to add:**
- `@google-cloud/pubsub`
- `zod` (runtime payload validation)

**Pattern:** Follow `src/modules/spreadsheet/SpreadsheetsClient.ts`

---

### Task 2: HTTP Module

Create a lightweight HTTP server module wrapping Bun's native HTTP.

**Files to create:**
- `src/modules/http/HttpServer.ts` - Bun.serve wrapper with routing
- `src/modules/http/types.ts` - Request/Response types
- `src/modules/http/errors.ts` - HTTP errors
- `src/modules/http/index.ts` - Exports

**Rationale:** Bun native HTTP is sufficient for 2 endpoints; no framework needed.

---

### Task 3: Message Queue Gateway

Create abstract gateway in domain and Pub/Sub implementation.

**Files to create:**
- `src/domain/gateways/MessageQueueGateway.ts` - Abstract class + token
- `src/infrastructure/gateways/pubsub/PubSubMessageQueueGateway.ts` - Implementation
- `src/infrastructure/gateways/pubsub/types.ts` - Queue message types
- `src/infrastructure/gateways/pubsub/index.ts` - Exports

**Pattern:** Follow `src/domain/gateways/BankGateway.ts` and `src/infrastructure/gateways/monobank/`

---

### Task 4: Domain Layer Updates

Add balance update capability to AccountRepository.

**Files to modify:**
- `src/domain/repositories/AccountRepository.ts` - Add `updateBalance(externalId, newBalance)` method
- `src/infrastructure/repositories/SpreadsheetAccountRepository.ts` - Implement `updateBalance()`

**Files to create:**
- `src/domain/errors/DomainErrors.ts` - `AccountNotFoundError`

---

### Task 5: EnqueueWebhookTransaction Use Case

Handle incoming webhook: validate with Zod, enqueue for processing.

**Files to create:**
- `src/application/use-cases/EnqueueWebhookTransaction.ts`
- `src/application/schemas/webhookPayloadSchema.ts` - Zod schema

**Zod Schema:**
```typescript
import { z } from 'zod';

export const webhookPayloadSchema = z.object({
  type: z.literal('StatementItem'),
  data: z.object({
    account: z.string(),
    statementItem: z.object({
      id: z.string(),
      time: z.number(),
      description: z.string(),
      mcc: z.number(),
      amount: z.number(),
      balance: z.number(),
      currencyCode: z.number(),
      // ... other fields
    }),
  }),
});
```

**Behavior:**
1. Validate payload with Zod schema (parse, not validate)
2. Enqueue transaction data to Pub/Sub
3. Return immediately (< 5 seconds)

---

### Task 6: ProcessIncomingTransaction Use Case

Process a single transaction: save to spreadsheet, update account balance.

**Files to create:**
- `src/application/use-cases/ProcessIncomingTransaction.ts`

**Input:** Transaction data (account ID + statement item) - use case doesn't know about queue.

**Behavior:**
1. Find account by externalId
2. Check transaction deduplication by externalId
3. Map to Transaction entity using existing `MonobankMapper.toTransaction()`
4. Save transaction
5. Update account balance (use `balance` from webhook, not compute)

**Error handling:** Throw on failure - caller (job) handles retry logic.

**Reuse:** `MonobankMapper.toTransaction()` from `src/infrastructure/gateways/monobank/MonobankMapper.ts`

---

### Task 7: Webhook HTTP Controller

Create HTTP endpoint handlers.

**Files to create:**
- `src/presentation/http/controllers/WebhookController.ts`
- `src/presentation/http/WebhookServer.ts` - Server setup

**Endpoints:**
- `GET /webhook` - Return 200 OK (Monobank validation)
- `POST /webhook` - Parse JSON, call ProcessWebhookTransaction, return 200 (always, even on error)
- `GET /health` - Health check for Cloud Run

**Critical:** Always return 200 to POST to prevent Monobank disabling webhook.

---

### Task 8: Job Entry Points

Create entry points for Cloud Run.

**Files to create:**
- `src/jobs/webhook-server.ts` - HTTP server for Cloud Run Service
- `src/jobs/process-webhooks.ts` - Queue processor for Cloud Run Job

**process-webhooks.ts behavior (SQS-like retry pattern):**
1. Pull batch of messages from Pub/Sub
2. For each message:
   - Call `ProcessIncomingTransaction` use case
   - On success: acknowledge message (removed from queue)
   - On failure: don't acknowledge (message stays in queue, will be redelivered)
3. Pub/Sub handles retry with exponential backoff (10s-600s)
4. After `max_delivery_attempts` (5), message goes to DLQ topic
5. DLQ subscription logs failed messages for debugging

**Pattern:** Follow `src/jobs/sync-monobank.ts`

---

### Task 9: DI Container Updates

Register new gateways and use cases.

**Files to modify:**
- `src/container.ts` - Add:
  - `MESSAGE_QUEUE_GATEWAY_TOKEN` → `PubSubMessageQueueGateway`
  - Pub/Sub config token
  - New use cases are auto-resolved (decorated with `@injectable()`)

---

### Task 10: CLI Command - Set Webhook

Create CLI command to register webhook URL with Monobank.

**Files to create:**
- `src/presentation/cli/commands/set-webhook.ts`

**Behavior:**
```bash
bun run src/main.ts set-webhook https://webhook-xxx.run.app/webhook
```

1. Call `POST https://api.monobank.ua/personal/webhook` with `{ webHookUrl: url }`
2. Display success/error message

**Files to modify:**
- `src/presentation/cli/index.ts` - Add command
- `src/infrastructure/gateways/monobank/MonobankGateway.ts` - Add `setWebhook(url)` method
- `src/domain/gateways/BankGateway.ts` - Add `setWebhook(url)` to abstract class

---

### Task 11: Terraform Infrastructure

Add Pub/Sub, Cloud Run Service, and Job resources.

**Files to modify:**
- `terraform/main.tf` - Add:
  - `google_pubsub_topic.webhook_transactions`
  - `google_pubsub_subscription.webhook_transactions` (with dead letter policy)
  - `google_pubsub_topic.webhook_transactions_dlq` (dead letter topic)
  - `google_cloud_run_v2_service.webhook` (public endpoint)
  - `google_cloud_run_v2_job.process_webhooks`
  - `google_cloud_scheduler_job.process_webhooks` (every 5 minutes)
  - IAM bindings for Pub/Sub (publisher, subscriber)

**New outputs:**
- `webhook_url` - Cloud Run Service URL for Monobank

---

### Task 12: Docker Configuration

Use single Docker image with command override in Terraform.

**Files to modify:**
- `Dockerfile` - Generic image, command specified at runtime

**Approach:**
```dockerfile
ENTRYPOINT ["bun", "run"]
CMD ["src/jobs/sync-monobank.ts"]
```

**CI/CD builds 1 image, Terraform specifies command:**
- `budget-sync` - Single image, different `args` per Cloud Run resource

**Rationale:**
- Single image = less registry space
- Simpler CI/CD (build once, deploy to multiple)
- Command override via Terraform `args` property

---

### Task 13: CI/CD Updates

Update GitHub Actions to build and deploy single image.

**Files to modify:**
- `.github/workflows/deploy.yml` - Simplified to:
  - Build single `budget-sync` image
  - Deploy to sync-transactions job
  - Deploy to webhook service
  - Deploy to process-webhooks job

---

### Task 14: Unit Tests

Write tests for new use cases and components.

**Files to create:**
- `tests/unit/application/use-cases/EnqueueWebhookTransaction.test.ts`
- `tests/unit/application/use-cases/ProcessIncomingTransaction.test.ts`
- `tests/unit/modules/pubsub/PubSubClient.test.ts`
- `tests/unit/modules/http/HttpServer.test.ts`

**Update test helpers:**
- `tests/unit/helpers/mocks.ts` - Add message queue gateway mock
- `tests/unit/helpers/fixtures.ts` - Add webhook payload fixtures

---

## Critical Files Reference

| File | Purpose |
|------|---------|
| `src/container.ts` | DI setup - add new registrations |
| `src/domain/gateways/BankGateway.ts` | Add `setWebhook()` method |
| `src/domain/repositories/AccountRepository.ts` | Add `updateBalance()` method |
| `src/infrastructure/gateways/monobank/MonobankMapper.ts` | Reuse `toTransaction()` |
| `src/jobs/sync-monobank.ts` | Pattern for job entry points |
| `terraform/main.tf` | Infrastructure definitions |
| `docs/monobank-api.md` | Webhook API reference |

---

## Non-Functional Requirements

1. **Reliability:** Webhook endpoint always returns 200, even on internal errors
2. **Retry (SQS-like behavior):**
   - Failed message stays in main queue (not acknowledged)
   - Redelivered after ack deadline (60s default)
   - Exponential backoff: 10s → 600s between retries
   - After 5 failed attempts → message moves to DLQ topic
   - DLQ subscription has a handler that logs for debugging
3. **Idempotency:** Duplicate transactions skipped via externalId check
4. **Performance:** Queue processor runs every 5 minutes via Cloud Scheduler

---

## Deployment Sequence

1. Merge infrastructure changes (Terraform creates Pub/Sub, Cloud Run resources)
2. Deploy webhook server and queue processor
3. Get webhook URL from Terraform output
4. Run CLI command: `bun run src/main.ts set-webhook <url>`
5. Monobank sends GET request to validate
6. Webhook is active, POST requests start arriving
