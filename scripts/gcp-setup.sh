#!/bin/bash
# GCP Infrastructure Setup for budget-sync
#
# This script sets up all required GCP resources for deployment.
# Run once to initialize the infrastructure.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Project already created (budget-sync-483105)
#
# Usage:
#   ./scripts/gcp-setup.sh

set -euo pipefail

# Configuration
PROJECT_ID="budget-sync-483105"
REGION="europe-central2"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
echo_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
echo_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo_error "gcloud CLI is not installed. Please install it first."
    exit 1
fi

echo_info "Setting up GCP infrastructure for budget-sync..."
echo_info "Project: $PROJECT_ID"
echo_info "Region: $REGION"
echo ""

# Set project
echo_info "Setting project..."
gcloud config set project "$PROJECT_ID"

# Enable required APIs
echo_info "Enabling required APIs..."
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    cloudscheduler.googleapis.com \
    sheets.googleapis.com

# Create Artifact Registry repository
echo_info "Creating Artifact Registry repository..."
if gcloud artifacts repositories describe budget-sync --location="$REGION" &> /dev/null; then
    echo_warn "Artifact Registry repository 'budget-sync' already exists"
else
    gcloud artifacts repositories create budget-sync \
        --repository-format=docker \
        --location="$REGION" \
        --description="Budget Sync Docker images"
fi

# Create service accounts
echo_info "Creating service accounts..."

# Runner service account (for Cloud Run Jobs)
if gcloud iam service-accounts describe "budget-sync-runner@$PROJECT_ID.iam.gserviceaccount.com" &> /dev/null; then
    echo_warn "Service account 'budget-sync-runner' already exists"
else
    gcloud iam service-accounts create budget-sync-runner \
        --display-name="Budget Sync Runner"
fi

# Scheduler service account (for triggering jobs)
if gcloud iam service-accounts describe "budget-sync-scheduler@$PROJECT_ID.iam.gserviceaccount.com" &> /dev/null; then
    echo_warn "Service account 'budget-sync-scheduler' already exists"
else
    gcloud iam service-accounts create budget-sync-scheduler \
        --display-name="Budget Sync Scheduler"
fi

# Deployer service account (for GitHub Actions)
if gcloud iam service-accounts describe "budget-sync-deployer@$PROJECT_ID.iam.gserviceaccount.com" &> /dev/null; then
    echo_warn "Service account 'budget-sync-deployer' already exists"
else
    gcloud iam service-accounts create budget-sync-deployer \
        --display-name="Budget Sync Deployer"
fi

# Grant permissions
echo_info "Granting permissions..."

# Runner: Secret accessor
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:budget-sync-runner@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None \
    --quiet

# Scheduler: Cloud Run invoker
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:budget-sync-scheduler@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/run.invoker" \
    --condition=None \
    --quiet

# Deployer: Cloud Run admin
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:budget-sync-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/run.admin" \
    --condition=None \
    --quiet

# Deployer: Artifact Registry writer
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:budget-sync-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer" \
    --condition=None \
    --quiet

# Deployer: Service Account User (to attach service accounts to Cloud Run)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:budget-sync-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser" \
    --condition=None \
    --quiet

echo ""
echo_info "Creating secrets (you'll need to add values manually)..."

# Create secrets (without values)
for secret in monobank-token spreadsheet-id; do
    if gcloud secrets describe "$secret" &> /dev/null; then
        echo_warn "Secret '$secret' already exists"
    else
        gcloud secrets create "$secret" --replication-policy="automatic"
        echo_info "Created secret '$secret' - add value with:"
        echo "  echo -n 'YOUR_VALUE' | gcloud secrets versions add $secret --data-file=-"
    fi
done

# Grant runner access to secrets
for secret in monobank-token spreadsheet-id; do
    gcloud secrets add-iam-policy-binding "$secret" \
        --member="serviceAccount:budget-sync-runner@$PROJECT_ID.iam.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet
done

echo ""
echo_info "Creating deployer key for GitHub Actions..."
KEY_FILE="deployer-key.json"
if [ -f "$KEY_FILE" ]; then
    echo_warn "Key file '$KEY_FILE' already exists. Delete it first if you want a new one."
else
    gcloud iam service-accounts keys create "$KEY_FILE" \
        --iam-account="budget-sync-deployer@$PROJECT_ID.iam.gserviceaccount.com"
    echo_info "Created $KEY_FILE - add this to GitHub Secrets as GCP_SA_KEY"
fi

echo ""
echo "========================================"
echo_info "Setup complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Add secret values:"
echo "   echo -n 'your-monobank-token' | gcloud secrets versions add monobank-token --data-file=-"
echo "   echo -n 'your-spreadsheet-id' | gcloud secrets versions add spreadsheet-id --data-file=-"
echo ""
echo "2. Share your Google Spreadsheet with the runner service account:"
echo "   budget-sync-runner@$PROJECT_ID.iam.gserviceaccount.com"
echo ""
echo "3. Add GitHub Secrets:"
echo "   - GCP_PROJECT_ID: $PROJECT_ID"
echo "   - GCP_SA_KEY: contents of $KEY_FILE"
echo ""
echo "4. Push to main branch to trigger deployment"
echo ""
