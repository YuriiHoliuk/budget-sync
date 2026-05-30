# budget-sync — Kubernetes manifests

Kustomize manifests that run budget-sync as a self-hosted **monolith** on a
single-node K3s cluster in the homelab.

## How it's deployed

These manifests are **not** applied by hand. The homelab repo defines an
Argo CD `Application` that points at this `k8s/` directory. Argo CD renders
`kustomization.yaml` and syncs the resources into the `budget-sync` namespace.

The container images come from private GHCR
(`ghcr.io/yuriiholiuk/budget-sync:main` and `…/budget-sync-web:main`), built and
pushed by CI on every merge to `main`. **Argo CD Image Updater** watches GHCR
and bumps the deployed image digest automatically, so a CI build flows to the
cluster with no manual step.

Pulling from private GHCR requires an image pull secret named `ghcr-pull` in the
`budget-sync` namespace (provisioned by the homelab platform).

## Resources

| File | Purpose |
|------|---------|
| `namespace.yaml` | `budget-sync` namespace |
| `configmap.yaml` | non-secret env (queue, scheduler cron, metrics, webhook URL) |
| `redis.yaml` | in-cluster Redis (BullMQ broker) + Service; transient (emptyDir) |
| `deployment.yaml` | the monolith (server + worker + scheduler), singleton, Recreate |
| `service.yaml` | ClusterIP for in-cluster traffic + metrics scraping |
| `webhook-nodeport.yaml` | NodePort `30081` → Tailscale Funnel target for `/webhook` |
| `web-deployment.yaml` / `web-service.yaml` | Next.js frontend |
| `ingress.yaml` | `money.lab` → web (ingressClassName `nginx`) |
| `servicemonitor.yaml` | Prometheus Operator scrape of `/metrics` |

## Secret: `budget-sync-secrets`

The Deployment loads this Secret via `envFrom`. It is delivered as a
SealedSecret generated out-of-band by
`homelab/scripts/seal-budget-sync-secrets.sh` and committed into the homelab
repo (never to this repo). It must contain these keys:

- `DATABASE_URL` — Neon Postgres connection string
- `MONOBANK_TOKEN` — Monobank personal API token
- `SPREADSHEET_ID` — Google Sheets spreadsheet ID
- `GEMINI_API_KEY` — Google Gemini API key

## Local validation

```bash
kubectl kustomize k8s/
```

The build intentionally omits the Secret (generated separately), so the
rendered manifests reference `budget-sync-secrets` without defining it.
