# Categorization Queue via Pub/Sub

## Problem

Transaction categorization uses Gemini API which has rate limits (~15 RPM on free tier). When multiple transactions arrive close together, the second one's LLM call gets rate-limited. Failed categorizations stay in `pending` state forever with no retry mechanism.

Current flow:
```
Webhook → Save Transaction → Categorize (inline, sync) → fails silently on rate limit
```

## Solution

Decouple categorization from transaction processing using a dedicated Pub/Sub queue with push delivery, same pattern as the webhook transaction queue. Pub/Sub's built-in retry with exponential backoff naturally handles rate limiting without polling.

Target flow:
```
Webhook → Save Transaction → Enqueue Categorization → Return 200
                                      ↓
                            Pub/Sub push delivery
                                      ↓
                            POST /webhook/categorize
                                      ↓
                            CategorizeTransaction use case
                                      ↓
                            200 OK (success) or 500 (retry)
```

## Design Decisions

### Why push (not pull)?
- Same pattern as existing webhook-transactions queue
- No polling infrastructure needed
- Pub/Sub manages retry timing with exponential backoff (10s-600s)
- Naturally rate-limits: next message arrives after backoff on 500

### Why a separate topic (not reuse webhook-transactions)?
- Different retry policies (categorization can tolerate longer delays)
- Independent scaling and monitoring
- Clear separation of concerns
- Different DLQ handling (categorization failures are non-critical)

### Rate limit handling
- On rate limit → return HTTP 500 → Pub/Sub retries with exponential backoff (10s min, 600s max)
- This naturally spaces out requests: 10s, 20s, 40s, 80s, 160s, 320s, 600s
- Max 5 delivery attempts before DLQ (configurable)
- Transactions in DLQ get status `failed` and can be retried via CLI
