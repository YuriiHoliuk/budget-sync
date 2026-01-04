# Infrastructure as Code Options Report

**Project:** budget-sync
**Date:** 2026-01-03
**Problem:** Currently using gcloud CLI commands to manage infrastructure, which is not reliable or reproducible.

---

## Executive Summary

This report evaluates Infrastructure as Code (IaC) options for the budget-sync project, which deploys Cloud Run Jobs to Google Cloud Platform. After analyzing four approaches (Terraform, Pulumi, Google Cloud Deployment Manager, and improved gcloud CLI scripting), **Terraform is the recommended solution** for its balance of maturity, community support, and suitability for GCP workloads.

---

## Current Infrastructure State

### Resources Managed

| Resource Type | Count | Examples |
|---------------|-------|----------|
| Cloud Run Jobs | 1 | `sync-transactions` |
| Cloud Scheduler Jobs | 1 | `sync-transactions-scheduler` (every 3 hours) |
| Service Accounts | 3 | `budget-sync-runner`, `budget-sync-scheduler`, `budget-sync-deployer` |
| Secret Manager Secrets | 2 | `monobank-token`, `spreadsheet-id` |
| Artifact Registry | 1 | `budget-sync` repository |

### Current Management Approach

- **Setup:** Manual bash script (`scripts/gcp-setup.sh`) runs gcloud commands once
- **Deployment:** GitHub Actions workflow uses gcloud CLI to deploy
- **Operations:** Just task runner wraps common gcloud commands

### Problems with Current Approach

1. **Not idempotent:** Running setup script twice may fail or create duplicates
2. **No drift detection:** Cannot detect manual changes via GCP Console
3. **No state tracking:** No record of what's actually deployed vs. what should be
4. **No preview:** Cannot see what will change before applying
5. **Error-prone:** Script failures may leave infrastructure in unknown state
6. **Limited rollback:** Must manually figure out how to undo changes

---

## Option 1: Terraform

### Overview

Terraform is the industry-standard declarative IaC tool using HashiCorp Configuration Language (HCL). It maintains a state file tracking deployed resources and calculates diffs to determine required changes.

### Pros

| Advantage | Description |
|-----------|-------------|
| **Industry standard** | Largest community, extensive documentation, transferable skills |
| **Mature ecosystem** | 10+ years proven, 3,900+ providers, 23,600+ modules |
| **Declarative** | Define desired state; Terraform figures out how to achieve it |
| **State management** | Tracks deployed resources, detects drift |
| **Preview changes** | `terraform plan` shows exactly what will change |
| **Multi-cloud** | Works with AWS, Azure, GCP, 300+ providers |
| **First-class GCP support** | Provider maintained by HashiCorp AND Google |
| **GitHub Actions integration** | Official `hashicorp/setup-terraform` action |

### Cons

| Disadvantage | Description |
|--------------|-------------|
| **Learning curve** | Must learn HCL syntax (1-2 weeks for basics) |
| **State file management** | Requires backend configuration (GCS bucket) |
| **No automatic rollback** | Must manually apply previous configuration |
| **HCL limitations** | Limited programming constructs (vs real languages) |
| **License concerns** | Changed to Business Source License (BSL) in 2023 |

### GCP Resource Support

```hcl
# Full support for all budget-sync resources:
google_cloud_run_v2_job          # Cloud Run Jobs
google_cloud_scheduler_job        # Cloud Scheduler
google_service_account           # Service Accounts
google_project_iam_member        # IAM Bindings
google_secret_manager_secret     # Secret Manager
google_artifact_registry_repository  # Artifact Registry
```

### State Management

- **Recommended backend:** Google Cloud Storage bucket
- **Built-in locking:** Prevents concurrent modifications
- **Versioning:** Enable bucket versioning for disaster recovery

```hcl
terraform {
  backend "gcs" {
    bucket = "budget-sync-terraform-state"
    prefix = "terraform/state"
  }
}
```

### Implementation Effort

| Phase | Effort |
|-------|--------|
| Setup state backend | 1 hour |
| Write HCL for existing resources | 4-6 hours |
| Import existing resources | 2-3 hours |
| CI/CD integration | 2-3 hours |
| **Total** | **~2 days** |

---

## Option 2: Pulumi

### Overview

Pulumi is a modern IaC tool that uses real programming languages (TypeScript, Python, Go, etc.) instead of domain-specific languages. Perfect for developers who want type safety and familiar tooling.

### Pros

| Advantage | Description |
|-----------|-------------|
| **TypeScript support** | Use the same language as budget-sync application |
| **Type safety** | Catch errors at development time with IDE support |
| **Real programming** | Loops, conditionals, functions, classes natively |
| **Free for individuals** | Pulumi Cloud free tier covers personal projects |
| **Modern DX** | Better IDE integration, autocomplete, refactoring |
| **Testing** | Unit test infrastructure with familiar frameworks |
| **Apache 2.0 license** | True open source |

### Cons

| Disadvantage | Description |
|--------------|-------------|
| **Smaller community** | Less Stack Overflow content, fewer examples |
| **Learning curve** | Must learn Pulumi patterns (Outputs, apply) |
| **State dependency** | Requires Pulumi Cloud or self-managed backend |
| **Less mature** | Newer tool, some edge cases less documented |
| **Imperative complexity** | Code can become complex without discipline |

### TypeScript Example

```typescript
import * as gcp from "@pulumi/gcp";

const runner = new gcp.serviceaccount.Account("budget-sync-runner", {
    accountId: "budget-sync-runner",
    displayName: "Budget Sync Runner",
});

const job = new gcp.cloudrunv2.Job("sync-transactions", {
    location: "europe-central2",
    template: {
        template: {
            containers: [{
                image: imageTag,
                envs: [{
                    name: "MONOBANK_TOKEN",
                    valueSource: {
                        secretKeyRef: {
                            secret: "monobank-token",
                            version: "latest",
                        },
                    },
                }],
            }],
            serviceAccount: runner.email,
            maxRetries: 1,
            timeout: "900s",
        },
    },
});
```

### State Management Options

| Option | Pros | Cons |
|--------|------|------|
| **Pulumi Cloud (Free)** | Zero setup, automatic locking | Data on Pulumi servers |
| **GCS Backend** | Full control, no external dependency | Manual setup required |

### Implementation Effort

| Phase | Effort |
|-------|--------|
| Learn Pulumi basics | 2-4 hours |
| Write TypeScript infrastructure | 4-6 hours |
| Setup state backend | 1-2 hours |
| CI/CD integration | 2-3 hours |
| **Total** | **~2 days** |

---

## Option 3: Google Cloud Deployment Manager

### Overview

Google's native IaC tool using YAML templates with Jinja2/Python for templating. Provides managed state without external dependencies.

### Critical Issue: End of Life

> **Google Cloud Deployment Manager will reach end of support on March 31, 2026.**
>
> Google strongly recommends migrating to Infrastructure Manager (Terraform-based) or alternative tools before this deadline.

### Pros

| Advantage | Description |
|-----------|-------------|
| **Native GCP integration** | No external tools or accounts needed |
| **Managed state** | No state backend to configure |
| **Free** | No additional costs |

### Cons

| Disadvantage | Description |
|--------------|-------------|
| **Deprecated** | End of support March 31, 2026 |
| **GCP only** | No multi-cloud capability |
| **Limited Cloud Run support** | No official templates for Cloud Run Jobs |
| **Steep learning curve** | YAML + Jinja2/Python templating |
| **Small community** | Limited resources and examples |
| **No active development** | Maintenance mode only |

### Verdict

**Do NOT use for new projects.** Investment would be wasted as the service is being shut down.

---

## Option 4: Improved gcloud CLI Scripting

### Overview

Enhance the current approach with better practices for idempotency, state tracking, and error handling. Keep using bash scripts with Just task runner.

### Pros

| Advantage | Description |
|-----------|-------------|
| **No new tools** | Continue using familiar gcloud commands |
| **Zero learning curve** | Already know bash and gcloud |
| **No state management** | No backend to configure |
| **Quick for small projects** | Minimal overhead |
| **Direct API access** | Latest GCP features immediately |

### Cons

| Disadvantage | Description |
|--------------|-------------|
| **Manual idempotency** | Must add check-before-create patterns |
| **No drift detection** | Cannot detect console changes |
| **No preview** | Cannot see changes before applying |
| **Manual state tracking** | Requires external solution |
| **Error-prone at scale** | Complex scripts become unmaintainable |
| **GCP only** | Single cloud lock-in |

### Improvement Patterns

**1. Idempotent resource creation:**
```bash
# Check before create
if ! gcloud iam service-accounts describe "budget-sync-runner@$PROJECT.iam.gserviceaccount.com" &>/dev/null; then
    gcloud iam service-accounts create budget-sync-runner
fi
```

**2. Resource labels for tracking:**
```bash
gcloud run jobs deploy sync-transactions \
    --labels="commit-sha=${GITHUB_SHA},deployed-at=$(date +%s)"
```

**3. State export for drift detection:**
```bash
# Periodic export to track drift
gcloud beta resource-config bulk-export \
    --project=budget-sync-483105 \
    --resource-format=terraform \
    --path=/tmp/state-export
```

**4. Deployment manifests:**
```bash
# Store deployment record
echo '{"commit":"'$SHA'","time":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' | \
    gcloud storage cp - gs://budget-sync-state/deployments/$SHA.json
```

### Implementation Effort

| Phase | Effort |
|-------|--------|
| Add idempotency checks | 2-3 hours |
| Add resource labels | 1 hour |
| Setup state tracking | 2-3 hours |
| Improve error handling | 2-3 hours |
| **Total** | **~1 day** |

---

## Comparison Matrix

| Criteria | Terraform | Pulumi | Deployment Manager | gcloud Scripts |
|----------|-----------|--------|-------------------|----------------|
| **Maturity** | Excellent | Good | Deprecated | N/A |
| **Community** | Huge | Growing | Declining | N/A |
| **Learning Curve** | Medium | Medium | High | Low |
| **GCP Support** | Excellent | Good | Limited | Native |
| **State Management** | Built-in | Built-in | Built-in | Manual |
| **Drift Detection** | Yes | Yes | No | No |
| **Preview Changes** | Yes | Yes | Yes | No |
| **Multi-cloud** | Yes | Yes | No | No |
| **Type Safety** | No | Yes | No | No |
| **License** | BSL | Apache 2.0 | N/A | N/A |
| **Future Viability** | Excellent | Excellent | None | Stable |

### Scoring (1-5, 5 = best)

| Criteria | Weight | Terraform | Pulumi | gcloud Scripts |
|----------|--------|-----------|--------|----------------|
| Reliability | 25% | 5 | 5 | 3 |
| Ease of Use | 20% | 3 | 4 | 5 |
| Community/Support | 20% | 5 | 3 | 4 |
| GCP Integration | 15% | 5 | 4 | 5 |
| Future-proofing | 10% | 4 | 5 | 3 |
| Implementation Cost | 10% | 3 | 3 | 5 |
| **Weighted Score** | | **4.25** | **4.00** | **3.85** |

---

## Recommendation

### Primary Recommendation: Terraform

**Terraform is the recommended solution** for the following reasons:

1. **Industry standard:** Skills are transferable, abundant resources available
2. **Mature and proven:** 10+ years in production at scale
3. **Excellent GCP support:** Provider co-maintained by Google
4. **Right-sized complexity:** Not overkill for ~10 resources
5. **Migration path exists:** Can export current state with `gcloud beta resource-config bulk-export`
6. **Team scalability:** Easy to onboard contributors

### Alternative: Pulumi (If TypeScript preference is strong)

Choose Pulumi if:
- You strongly prefer TypeScript over learning HCL
- Type safety is a high priority
- You want to test infrastructure with familiar tools

### When to Keep gcloud Scripts

Stay with improved gcloud scripts if:
- Infrastructure will never grow beyond current scope
- Learning Terraform is not a priority
- Simplicity is valued over robustness
- This is a purely personal project with no collaboration

---

## Implementation Roadmap (Terraform)

### Phase 1: Foundation (Day 1)

1. Create GCS bucket for Terraform state:
   ```bash
   gsutil mb -l europe-central2 gs://budget-sync-terraform-state
   gsutil versioning set on gs://budget-sync-terraform-state
   ```

2. Create `terraform/` directory structure:
   ```
   terraform/
   ├── main.tf
   ├── variables.tf
   ├── outputs.tf
   ├── provider.tf
   └── backend.tf
   ```

3. Configure provider and backend

### Phase 2: Resource Definitions (Day 1-2)

1. Define all resources in HCL:
   - Service accounts
   - IAM bindings
   - Secret Manager secrets (references, not values)
   - Artifact Registry repository
   - Cloud Run Job
   - Cloud Scheduler

2. Use `gcloud beta resource-config bulk-export` for reference

### Phase 3: Import Existing Resources (Day 2)

1. Generate import commands:
   ```bash
   gcloud beta resource-config terraform generate-import \
       --project=budget-sync-483105 \
       --path=terraform/
   ```

2. Run imports:
   ```bash
   terraform import google_service_account.runner \
       projects/budget-sync-483105/serviceAccounts/budget-sync-runner@budget-sync-483105.iam.gserviceaccount.com
   ```

3. Verify with `terraform plan` (should show no changes)

### Phase 4: CI/CD Integration (Day 2-3)

1. Update GitHub Actions workflow:
   ```yaml
   - uses: hashicorp/setup-terraform@v3

   - name: Terraform Plan
     run: terraform plan -out=tfplan

   - name: Terraform Apply
     if: github.ref == 'refs/heads/main'
     run: terraform apply -auto-approve tfplan
   ```

2. Keep Docker build/push in existing workflow
3. Update Cloud Run job image via Terraform variable

### Phase 5: Documentation & Cleanup (Day 3)

1. Update CLAUDE.md with Terraform instructions
2. Document rollback procedures
3. Remove redundant gcloud commands from setup script
4. Keep operational commands in justfile (logs, manual runs)

---

## Appendix: Quick Reference

### Terraform Quick Start

```bash
# Install
brew install terraform

# Initialize
cd terraform && terraform init

# Preview changes
terraform plan

# Apply changes
terraform apply

# View current state
terraform state list
```

### Pulumi Quick Start

```bash
# Install
brew install pulumi

# Login (free cloud)
pulumi login

# Create project
pulumi new gcp-typescript

# Preview changes
pulumi preview

# Apply changes
pulumi up
```

### gcloud State Export

```bash
# Export current state to Terraform format
gcloud beta resource-config bulk-export \
    --project=budget-sync-483105 \
    --resource-format=terraform \
    --path=/tmp/export
```

---

## Sources

- [Terraform GCP Provider Documentation](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [Pulumi GCP Provider Documentation](https://www.pulumi.com/registry/packages/gcp/)
- [Google Cloud Deployment Manager Deprecation Notice](https://cloud.google.com/deployment-manager/docs/deprecations)
- [Scripting gcloud CLI Commands](https://cloud.google.com/sdk/docs/scripting-gcloud)
- [Export Google Cloud Resources to Terraform](https://cloud.google.com/docs/terraform/resource-management/export)
