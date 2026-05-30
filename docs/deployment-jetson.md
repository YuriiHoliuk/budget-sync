---
description: Self-hosted deployment of budget-sync as a K3s monolith on the Jetson, deployed by Argo CD. Covers the monolith process model, env matrix, Redis/BullMQ queue, Image Updater flow, the Tailscale Funnel webhook path, and money.lab ingress.
---

# Jetson Deployment (K3s Monolith)

This document covers the **self-hosted** deployment of budget-sync on the
homelab Jetson Orin NX (arm64), running on a single-node K3s cluster and
deployed by Argo CD. This is an alternative to the Cloud Run deployment in
`deployment.md`; both consume the same images.

For the cluster platform itself (K3s install, Argo CD, sealed-secrets, ingress
controller, kube-prometheus-stack), see `homelab/docs/k3s-cluster.md`. The
design rationale lives in the research doc.

## What stays the same

GCP and Neon are **unchanged**. The Postgres database is still external on Neon
(reached via `DATABASE_URL`); Google Sheets and Gemini are still hit over their
public APIs. Only the *compute* moves: instead of Cloud Run Jobs/Services, a
single pod runs everything in-cluster.

## The monolith model

Cloud Run splits the backend into separate workloads (a `webhook` Service, a
`sync-accounts` Job). On the Jetson, those collapse into **one process** started
by `src/jobs/monolith.ts` (the image ENTRYPOINT is `["bun","run"]`; the
Deployment overrides args to `["src/jobs/monolith.ts"]`). That single process
runs:

- **HTTP server** (`RUN_SERVER`, default true) — serves `GET /health`,
  `GET /ready`, `GET /metrics`, `POST /webhook`, and `/graphql` on `PORT` (8080).
- **BullMQ worker** (`RUN_WORKER=true`) — processes queued sync jobs.
- **Account-sync scheduler** (`RUN_SCHEDULER=true`) — enqueues a sync on the
  `SCHEDULER_SYNC_CRON` schedule (every 3 hours) and re-registers the Monobank
  webhook.

Because the worker and scheduler must be a **singleton** (two would double-fire
syncs / compete on jobs), the Deployment runs `replicas: 1` with
`strategy: Recreate` — the old pod is killed before the new one starts.

## Redis / BullMQ queue

The queue driver is Redis (`QUEUE_DRIVER=redis`). An in-cluster
`redis:7-alpine` Deployment + ClusterIP Service (`budget-sync-redis:6379`)
backs BullMQ. The queue is **transient**: jobs are re-enqueued by the scheduler,
so Redis uses an `emptyDir` (no PVC) and losing it on restart is harmless.

## Environment matrix

Non-secret config comes from the `budget-sync-config` ConfigMap; secrets from
the `budget-sync-secrets` Secret. Both are mounted into the pod via `envFrom`.

| Var | Source | Value / notes |
|-----|--------|---------------|
| `QUEUE_DRIVER` | ConfigMap | `redis` |
| `RUN_SERVER` | (default) | `true` — HTTP server on |
| `RUN_WORKER` | ConfigMap | `true` |
| `RUN_SCHEDULER` | ConfigMap | **`false` while in shadow** — flip to `true` at cutover (see below) |
| `REDIS_URL` | ConfigMap | `redis://budget-sync-redis:6379` |
| `SCHEDULER_SYNC_CRON` | ConfigMap | `0 */3 * * *` |
| `METRICS_ENABLED` | ConfigMap | `true` |
| `PORT` | ConfigMap | `8080` |
| `WEBHOOK_URL` | ConfigMap | Tailscale Funnel URL, set at cutover |
| `DATABASE_URL` | Secret | Neon connection string |
| `MONOBANK_TOKEN` | Secret | Monobank API token |
| `SPREADSHEET_ID` | Secret | Google Sheets ID |
| `GEMINI_API_KEY` | Secret | Gemini API key |

The web frontend (`budget-sync-web`) takes only `API_URL=http://budget-sync:8080`
to reach the backend in-cluster.

## How Argo CD deploys it

The manifests live in this repo under `k8s/` (Kustomize). The homelab repo
defines an Argo CD `Application` pointing at that directory; Argo CD renders the
kustomization and syncs into the `budget-sync` namespace.

Images come from **public** GHCR
(`ghcr.io/yuriiholiuk/budget-sync:main`, `…/budget-sync-web:main`), built
multi-arch (incl. arm64) by CI on merge to `main`. **Argo CD Image Updater**
watches GHCR and updates the deployed image automatically, so CI → cluster needs
no manual step. The packages are public, so **no image pull secret is needed**.

### Secrets (SealedSecret)

`budget-sync-secrets` is **not** committed to this repo. It is sealed by
`homelab/scripts/seal-budget-sync-secrets.sh` into a SealedSecret committed to
the homelab repo; the sealed-secrets controller decrypts it in-cluster. Required
keys: `DATABASE_URL`, `MONOBANK_TOKEN`, `SPREADSHEET_ID`, `GEMINI_API_KEY`.

## Webhook path (NodePort + Tailscale Funnel)

Monobank must POST to a public HTTPS URL. The path:

```
Monobank --> Tailscale Funnel (https://<node>.<tailnet>.ts.net/webhook)
          --> NodePort budget-sync-webhook (:30081)
          --> monolith pod (:8080, POST /webhook)
```

`budget-sync-webhook` is a NodePort Service (`nodePort: 30081`) selecting the
monolith pod. `homelab/scripts/tailscale-funnel.sh` configures Tailscale Funnel
to forward the public `/webhook` path to that NodePort. At cutover, set
`WEBHOOK_URL` in the ConfigMap to the Funnel URL and let the scheduler
re-register it with Monobank on its next run (or run a manual sync).

> ⚠️ **Funnel is currently OFF.** Tailscale Funnel/Serve takes over `:443` on the
> tailnet interface, which breaks remote `https://*.lab` access to every homelab
> service (they'd all fail TLS). While budget-sync is in shadow the Funnel is
> disabled (`tailscale serve reset`). Before cutover, the webhook-vs-`:443`
> coexistence must be solved (e.g. Funnel on `:8443`/`:10000`, or routing the
> `.lab` vhosts behind Tailscale Serve). See `homelab/docs/budget-sync-migration-research.md`.

## Current status: shadow

The deployment runs in **shadow**: the monolith + Redis + web are up against the
real Neon DB, but `RUN_SCHEDULER=false` and the Monobank webhook still points at
GCP — so the Jetson does no syncs and receives no webhooks yet. GCP remains the
active deployment. **Only one side may run the scheduler / hold the webhook at a
time** (shared Neon DB → split-brain risk). Cutover runbook:
`homelab/docs/budget-sync-migration-research.md`.

## Web UI (money.lab)

The frontend is reached at `https://money.lab`. The in-cluster Ingress
(`ingressClassName: nginx`, host `money.lab` → `budget-sync-web:3000`) has no TLS
block — TLS is terminated at the homelab **Compose nginx** edge, which proxies
`money.lab` to the K3s ingress HTTP NodePort (`30080`); ingress-nginx then routes
by `Host` to the web Service. The cert is the internal `homelab-root-ca` (same as
other `.lab` services).

## Observability

With `METRICS_ENABLED=true`, the backend exposes Prometheus metrics at
`/metrics` on 8080. The `budget-sync` ServiceMonitor (labelled
`release: kube-prometheus-stack`) tells the Prometheus Operator to scrape it.
This requires the kube-prometheus-stack CRDs installed by the homelab platform
(see `homelab/docs/k3s-cluster.md`).

A **Grafana dashboard** ships with the service: `k8s/grafana-dashboard.yaml` is a
ConfigMap (labelled `grafana_dashboard: "1"`) that the kube-prometheus-stack
Grafana sidecar auto-loads — no manual import. It shows pod CPU/memory/network,
process + Node.js runtime metrics, app throughput (webhooks, transactions, p95
latency, sync runs), and Loki log panels (all + errors). Open it at
`https://grafana.lab/d/budget-sync/budget-sync`. App-throughput panels stay flat
until cutover (no traffic in shadow); resource/runtime/log panels are live now.

Custom app metrics: `budget_sync_webhooks_received_total`,
`budget_sync_transaction_processing_seconds` (histogram),
`budget_sync_sync_runs_total`.
