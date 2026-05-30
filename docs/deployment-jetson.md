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
| `RUN_SCHEDULER` | ConfigMap | `true` |
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

Images come from private GHCR
(`ghcr.io/yuriiholiuk/budget-sync:main`, `…/budget-sync-web:main`), built
multi-arch (incl. arm64) by CI on merge to `main`. **Argo CD Image Updater**
watches GHCR and updates the deployed image automatically, so CI → cluster needs
no manual step. Pulls use the `ghcr-pull` image pull secret in the namespace.

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
monolith pod. Tailscale Funnel is configured on the node to forward the public
`/webhook` path to that NodePort. At cutover, set `WEBHOOK_URL` in the ConfigMap
to the Funnel URL and let the scheduler re-register it with Monobank on its next
run (or run a manual sync).

## Web UI (money.lab)

The frontend is reached at `https://money.lab` via the cluster's nginx Ingress
(`ingressClassName: nginx`, host `money.lab` → `budget-sync-web:3000`). TLS is
terminated upstream at the homelab edge, not by the Ingress.

## Observability

With `METRICS_ENABLED=true`, the backend exposes Prometheus metrics at
`/metrics` on 8080. The `budget-sync` ServiceMonitor (labelled
`release: kube-prometheus-stack`) tells the Prometheus Operator to scrape it.
This requires the kube-prometheus-stack CRDs installed by the homelab platform
(see `homelab/docs/k3s-cluster.md`).
