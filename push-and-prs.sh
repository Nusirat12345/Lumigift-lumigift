#!/usr/bin/env bash
# Run this script with git credentials that have push access to joekeyz8/Lumigift-lumigift
# Usage: GH_PAT=<your-pat> bash push-and-prs.sh
set -euo pipefail

REPO="joekeyz8/Lumigift-lumigift"
BASE_BRANCH="main"

if [[ -n "${GH_PAT:-}" ]]; then
  git remote set-url origin "https://joekeyz8:${GH_PAT}@github.com/${REPO}.git"
fi

echo "Pushing branches..."
git push origin feat/opentelemetry-tracing
git push origin feat/stellar-webhook-verification
git push origin feat/cosign-image-signing
git push origin feat/db-connection-pool-tuning
echo "All branches pushed."

echo "Creating PRs..."
gh pr create \
  --repo "$REPO" \
  --base "$BASE_BRANCH" \
  --head "feat/opentelemetry-tracing" \
  --title "feat: add OpenTelemetry distributed tracing" \
  --body "$(cat .github/pr-bodies/opentelemetry-tracing.md)"

gh pr create \
  --repo "$REPO" \
  --base "$BASE_BRANCH" \
  --head "feat/stellar-webhook-verification" \
  --title "feat: add HMAC-SHA256 webhook signature verification with replay protection" \
  --body "$(cat .github/pr-bodies/stellar-webhook-verification.md)"

gh pr create \
  --repo "$REPO" \
  --base "$BASE_BRANCH" \
  --head "feat/cosign-image-signing" \
  --title "feat: add Cosign keyless image signing with SLSA provenance" \
  --body "$(cat .github/pr-bodies/cosign-image-signing.md)"

gh pr create \
  --repo "$REPO" \
  --base "$BASE_BRANCH" \
  --head "feat/db-connection-pool-tuning" \
  --title "feat: tune DB connection pool and expose metrics on health endpoint" \
  --body "$(cat .github/pr-bodies/db-connection-pool-tuning.md)"

echo "All PRs created."
git remote set-url origin "https://github.com/${REPO}.git"
