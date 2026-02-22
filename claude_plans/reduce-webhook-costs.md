# Reduce Webhook Service Costs (~$63/mo → ~$10/mo)

## Context

The webhook Cloud Run service runs with `minScale=1` and CPU always allocated, costing ~$63/month — 96% of the total bill. This was needed because cold starts caused Monobank to disable webhooks (5-second timeout, disabled after 3 failures).

The fix: keep the instance warm but stop paying for idle CPU, and add a safety net to re-register the webhook automatically.

## Changes

### 1. Enable CPU throttling on webhook service

**File:** `terraform/main.tf` (line 611-616, webhook service resources block)

Add `cpu_idle` and `startup_cpu_boost` to the existing `resources` block:

```hcl
resources {
  limits = {
    cpu    = "1"
    memory = "512Mi"
  }
  cpu_idle          = true
  startup_cpu_boost = true
}
```

- `cpu_idle = true` — CPU deallocated when idle, billed at $0.0000025/s instead of $0.000024/s (10x cheaper)
- `startup_cpu_boost = true` — extra CPU during startup for snappy request handling after idle
- `minScale=1` stays — instance is always warm in memory, no cold starts
- CPU re-allocation on request arrival takes <100ms, well within Monobank's 5s timeout

**Cost impact:** ~$63/mo → ~$10/mo

### 2. Add webhook re-registration to sync-accounts job

Every 3 hours, re-register the webhook URL with Monobank as a safety net. If the webhook ever gets disabled, it's restored within 3 hours.

#### 2a. New use case: `src/application/use-cases/RegisterWebhook.ts`

- Extends `UseCase<RegisterWebhookRequest, RegisterWebhookResult>`
- Injects `BankGateway` via `BANK_GATEWAY_TOKEN`
- Calls `bankGateway.setWebhook(url)`, returns success/error result DTO
- Catches errors gracefully (never throws)

#### 2b. Modify `src/presentation/jobs/SyncAccountsJob.ts`

- Add `RegisterWebhookUseCase` dependency (auto-resolved by TSyringe)
- Read `WEBHOOK_URL` from env (optional, skip re-registration if not set)
- After sync completes, call `registerWebhookUseCase.execute({ webhookUrl })`
- Webhook failure does NOT fail the job — it's a best-effort safety net
- Add webhook status to job result summary

#### 2c. Update `src/jobs/sync-accounts.ts` entry point

- No DI token needed for the use case (TSyringe auto-resolves by type)
- The webhook URL comes from `process.env.WEBHOOK_URL`, passed to the job

#### 2d. Add `WEBHOOK_URL` env var to sync-accounts job in Terraform

**File:** `terraform/main.tf` (sync_accounts job container env block, ~line 245)

```hcl
env {
  name  = "WEBHOOK_URL"
  value = "${google_cloud_run_v2_service.webhook.uri}/webhook"
}
```

### 3. Tests

- **New:** `tests/unit/application/use-cases/RegisterWebhook.test.ts` — success, gateway error, non-Error throw
- **Update:** `tests/unit/presentation/jobs/SyncAccountsJob.test.ts` — add mock for new dependency, test webhook registration called/skipped/failed scenarios

### 4. Update docs

- `docs/infrastructure.md` — note CPU throttling on webhook service
- `docs/TROUBLESHOOTING.md` — add section on webhook disabled by Monobank + auto-recovery

## Files to modify

| File | Change |
|------|--------|
| `terraform/main.tf` | Add `cpu_idle`, `startup_cpu_boost` to webhook; add `WEBHOOK_URL` env to job |
| `src/application/use-cases/RegisterWebhook.ts` | **New** — use case |
| `src/presentation/jobs/SyncAccountsJob.ts` | Add webhook re-registration after sync |
| `src/jobs/sync-accounts.ts` | Pass webhook URL from env |
| `tests/unit/application/use-cases/RegisterWebhook.test.ts` | **New** — unit tests |
| `tests/unit/presentation/jobs/SyncAccountsJob.test.ts` | Update for new dependency |
| `docs/infrastructure.md` | Document CPU throttling |
| `docs/TROUBLESHOOTING.md` | Document webhook recovery |

## Verification

1. `just check` — typecheck + lint pass
2. `just test` — all unit tests pass
3. After merge, Terraform plan shows `cpu_idle = true` and new env var — CI applies automatically
