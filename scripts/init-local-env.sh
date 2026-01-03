#!/usr/bin/env bash
# Initialize local development environment by pulling secrets from GCP
set -euo pipefail

echo "Checking gcloud authentication..."
gcloud auth print-identity-token > /dev/null 2>&1 || {
    echo "Error: Not authenticated with gcloud. Run 'gcloud auth login' first."
    exit 1
}

echo "Installing dependencies..."
bun install

echo "Pulling secrets from GCP Secret Manager..."
MONOBANK_TOKEN=$(gcloud secrets versions access latest --secret=monobank-token 2>/dev/null) || {
    echo "Error: Could not fetch monobank-token. Make sure you're authenticated with gcloud."
    exit 1
}
SPREADSHEET_ID=$(gcloud secrets versions access latest --secret=spreadsheet-id 2>/dev/null) || {
    echo "Error: Could not fetch spreadsheet-id."
    exit 1
}

echo "Creating .env file..."
cat > .env << EOF
MONOBANK_TOKEN=${MONOBANK_TOKEN}
SPREADSHEET_ID=${SPREADSHEET_ID}
GOOGLE_SERVICE_ACCOUNT_FILE=service-account.json
EOF

echo "Downloading service account key..."
if [ ! -f service-account.json ]; then
    PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
    gcloud iam service-accounts keys create service-account.json \
        --iam-account="budget-sync-runner@${PROJECT_ID}.iam.gserviceaccount.com" 2>/dev/null || {
        echo "Warning: Could not create service account key."
        echo "You may need to create it manually or copy from a secure location."
    }
else
    echo "service-account.json already exists, skipping..."
fi

echo ""
echo "Local environment initialized!"
echo "Run 'just sync' to test the setup."
