---
description: Reliability, availability, and durability of the webhook → queue → sync pipeline, where the current design is strong vs weak, and a ranked list of (mostly free) future improvements for surviving Jetson reboots and internet outages.
---

# Reliability & Availability

## Terminology (which word is correct?)

The three get conflated; they're distinct, and the webhook concern touches all three:

- **Availability** — is the system *up and reachable right now?* (uptime). The "Jetson is off / internet is down, so Monobank can't deliver" problem is an **availability** problem of the *ingestion endpoint*.
- **Reliability** — does it *do the right thing without failing* over time? (retries, ordering, no double-processing). The local queue's job — handling transient errors and processing in order — is **reliability**.
- **Durability** — once an event is *accepted*, it is *never lost*, even across crashes/restarts. Persisting a queued job so a reboot doesn't drop it is **durability**.

So "I might lose webhooks if the Jetson reboots or the internet drops" is really: **the ingestion endpoint's availability is tied to the Jetson, and accepted events aren't durably stored off-box.** "Availability improvements" is the most accurate umbrella, with durability close behind.

## Current architecture

```
Monobank ──(public HTTPS)──► Tailscale Funnel :8443 /webhook ──► Jetson budget-sync
                                                                   │  return 200 OK immediately
                                                                   ├─ enqueue → Redis/BullMQ (in-cluster)
                                                                   └─ worker: pull → process → categorize (retries+backoff, in order)
        Monobank statement API ◄── in-process scheduler (every 3h) ── reconciles anything webhooks missed
        Neon Postgres (cloud) ◄── idempotent inserts by externalId
```

### Where it's strong
- **Processing reliability**: BullMQ gives retries, exponential backoff, and a dead-letter set for transient failures (Gemini rate limits, blips). Inserts are **idempotent by `externalId`** → safe to replay, no double-counting.
- **Durability against data loss is already covered by the 3-hourly sync.** `SyncAccountsJob` pulls transactions from Monobank's *statement API* and backfills any webhook that never arrived. The webhook is a **latency optimization**; the **sync is the durability guarantee**. Monobank statements allow up to ~31 days/query, so widening the look-back covers long outages.

### Where it's weak (the actual gap)
- **Ingestion availability is bound to the Jetson.** If the Jetson is rebooting or the home internet is down, Monobank cannot deliver — the *local* queue never sees the event, because the event never arrives. The local queue protects processing, not ingestion.
- **Queue durability across a hard reboot**: in-cluster Redis persists to a hostPath, so a normal pod restart keeps jobs; but the queue still lives on the single Jetson.

**Net:** a Jetson reboot or internet outage means transactions arrive **late** (next sync reconciles them), not **lost** — so the urgency is lower than it feels. The improvements below buy *real-time delivery across outages* and *off-box durability*, not "preventing data loss" (the sync already does that).

## Cost baseline (GCP, after cutover to Jetson, 2026-05-31)

budget-sync runs on the Jetson; GCP is a cold standby.
- `webhook` Cloud Run → **`min-instances=0`** (scale-to-zero; was `min=1` burning ~$5–15/mo for nothing).
- `web` Cloud Run → scale-to-zero. `sync-accounts` job → only on trigger; **GCP Cloud Scheduler is paused**.
- Steady GCP cost ≈ **Secret Manager (6 secrets, ~$0.36/mo) + Artifact Registry (~4.6 GB, ~$0.40/mo) + Gemini usage**. Pub/Sub + Scheduler are within free tiers.
- To reach ~$0: prune old Artifact Registry images (keep `:main`), and optionally move secrets off Secret Manager.

## Potential improvements (ranked; all fit a personal account's volume on free tiers)

Personal Monobank volume = tens of events/day — comfortably inside every free tier below. Each is a contained adapter/config change thanks to the hexagonal design (`MessageQueueGateway`, `BankGateway`, `LLMGateway`).

1. **Durable edge webhook relay — Upstash QStash** *(solves the offline-ingestion gap; least code)*
   Point Monobank at the QStash URL. QStash stores the event, returns 200 instantly, and **forwards to the Jetson with automatic retries/backoff** across downtime. Free tier ~500 messages/day. The Monobank webhook URL changes from the Funnel URL to the QStash endpoint (which then targets the Funnel). This makes ingestion independent of Jetson uptime.

2. **Off-box queue broker — Upstash Redis (serverless, free tier)** *(cheapest reboot-durability win)*
   Swap `REDIS_URL` from the in-cluster Redis to a free Upstash Redis. Queued jobs then **survive Jetson reboots / disk loss** (the queue lives in the cloud). One-line change. Does *not* by itself fix offline *ingestion* (the receiver is still local) — pair with #1 for that. Free tier ~10k commands/day.

3. **Cloudflare Worker + D1/KV edge buffer** *(most DIY, very free/robust)*
   A free Worker receives the hook, returns 200, and writes the payload to **D1** (or KV); the Jetson drains pending rows when online. All free tiers (Workers 100k req/day, D1/KV free). Note: Cloudflare *Queues* needs a paid Workers plan — use D1/KV instead.

4. **Local LLM for categorization** *(removes the last cloud dependency for processing; privacy bonus)*
   Replace the Gemini call (`LLMGateway`) with a local model on the Jetson (Orin NX can run small quantized models). Eliminates Gemini cost/egress and keeps financial text on-box. Slower/lower-quality than Gemini Flash; evaluate quality before switching.

5. **Widen the sync look-back / add a catch-up sync on startup** *(zero new infra)*
   Make `SyncAccountsJob` look back far enough to cover the longest expected outage, and optionally trigger one sync immediately on scheduler start (today it waits for the next 3-h cron). Pure-code, free, and strengthens the existing backstop.

### Recommendation
- Want **true real-time delivery across outages** → **#1 (QStash)**.
- Want the **cheapest durability bump** for reboots → **#2 (Upstash Redis broker)**.
- Fine with **eventual consistency** (transactions arrive by the next sync) → keep as-is and optionally do **#5**.
- Independent of the above, **#4** is the path to a fully self-hosted, $0, private pipeline.

All four cloud options stay within free tiers at personal volume, so "can it be free?" → **yes**.
