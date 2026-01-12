# Troubleshooting

Quick solutions for common issues encountered during development and deployment.

## Terraform / CI/CD

### Error: User not authorized to perform this action (403)

**Symptom**: Terraform apply fails with permission denied when creating new resource types.

**Cause**: Deployer service account missing required IAM role.

**Fix**: Grant the role manually, then add to Terraform:

```bash
# Example for Pub/Sub
gcloud projects add-iam-policy-binding budget-sync-483105 \
  --member="serviceAccount:budget-sync-deployer@budget-sync-483105.iam.gserviceaccount.com" \
  --role="roles/pubsub.admin"
```

Then add to `terraform/main.tf`:
```hcl
resource "google_project_iam_member" "deployer_<service>_admin" {
  project = var.project_id
  role    = "roles/<service>.admin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}
```

### Error: Resource already exists (409)

**Symptom**: Terraform fails because resource exists but isn't in state.

**Cause**: Previous partial apply created resource before failing.

**Fix**: Import the resource into Terraform state:

```bash
terraform -chdir=terraform import <resource_type>.<name> <resource_id>

# Example for Cloud Run service
terraform -chdir=terraform import google_cloud_run_v2_service.webhook \
  projects/budget-sync-483105/locations/europe-central2/services/webhook
```

## Cloud Run

### Error: Memory < 512 Mi not supported with CPU always allocated

**Symptom**: Cloud Run service creation fails with memory validation error.

**Cause**: Cloud Run requires minimum 512Mi when CPU is always allocated.

**Fix**: Update Terraform to use at least 512Mi:

```hcl
resources {
  limits = {
    cpu    = "1"
    memory = "512Mi"
  }
}
```

### Error: Image not found

**Symptom**: Cloud Run job/service creation fails because Docker image doesn't exist.

**Cause**: Terraform runs before Docker build in CI/CD pipeline.

**Fix**: Build and push image manually first:

```bash
docker build --platform linux/amd64 \
  -t europe-central2-docker.pkg.dev/budget-sync-483105/budget-sync/budget-sync:latest .
gcloud auth configure-docker europe-central2-docker.pkg.dev --quiet
docker push europe-central2-docker.pkg.dev/budget-sync-483105/budget-sync/budget-sync:latest
```

### Error: exec format error

**Symptom**: Container fails to start with "failed to load /usr/local/bin/bun: exec format error".

**Cause**: Docker image built on ARM Mac but Cloud Run needs x86_64.

**Fix**: Always build with platform flag:

```bash
docker build --platform linux/amd64 -t <image> .
```

### Error: Missing required environment variable

**Symptom**: Container exits with "Missing required environment variable: X".

**Cause**: Terraform config missing required env vars for container.ts.

**Fix**: Add missing env vars to Cloud Run service/job in Terraform:

```hcl
env {
  name = "MONOBANK_TOKEN"
  value_source {
    secret_key_ref {
      secret  = google_secret_manager_secret.monobank_token.secret_id
      version = "latest"
    }
  }
}
```

## TSyringe / Dependency Injection

### Error: TypeInfo not known for "Object"

**Symptom**: Container fails with "Cannot inject the dependency X... TypeInfo not known for Object".

**Cause**: Using `import type` for classes that TSyringe needs to resolve at runtime.

**Fix**: Use regular import (not `import type`) for classes injected via TSyringe:

```typescript
// Good - runtime import
import { MyClass } from './MyClass.ts';

// Bad - type is erased at compile time
import type { MyClass } from './MyClass.ts';
```

**Why**: `import type` is removed at compile time, so TSyringe can't see the class metadata needed for DI resolution.

**Note**: The `useImportType` Biome rule is disabled in this project to prevent auto-conversion to `import type` which breaks TSyringe DI.
