#!/usr/bin/env bash
# Compatibility entry point for manually deploying all Quantivis Edge Functions.
#
# Production and staging CI use scripts/deploy-supabase-functions-resilient.sh
# directly with an environment-scoped SUPABASE_PROJECT_REF. Manual invocations
# must be equally explicit: never infer or silently default a remote project.

set -Eeuo pipefail

STAGING_PROJECT_REF="cmnihsbdbpubznlkmjbc"
PRODUCTION_PROJECT_REF="izgfrekdamlgigehxoqs"
RETIRED_PROJECT_REF="itpwpnwzzitkelffttyx"

: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF explicitly to the staging or production project reference}"

case "$SUPABASE_PROJECT_REF" in
  "$STAGING_PROJECT_REF")
    environment_name="staging"
    ;;
  "$PRODUCTION_PROJECT_REF")
    environment_name="production"
    ;;
  "$RETIRED_PROJECT_REF")
    echo "ERROR: $RETIRED_PROJECT_REF is the retired Quantivis Supabase project and must not receive deployments." >&2
    exit 2
    ;;
  *)
    echo "ERROR: Refusing to deploy Quantivis Edge Functions to unrecognised project $SUPABASE_PROJECT_REF." >&2
    echo "Allowed targets: $STAGING_PROJECT_REF (staging), $PRODUCTION_PROJECT_REF (production)." >&2
    exit 2
    ;;
esac

echo "Preparing generated Edge runtime assets..."
node scripts/build-supplier-risk-edge-runtime.mjs

echo "Deploying Quantivis Edge Functions to ${environment_name} (${SUPABASE_PROJECT_REF})..."
SUPABASE_PROJECT_REF="$SUPABASE_PROJECT_REF" bash scripts/deploy-supabase-functions-resilient.sh

echo ""
echo "Edge Function deployment complete. Database migrations are intentionally separate."
echo "Preview with: supabase db push --linked --include-all --dry-run"
echo "Apply only through the corresponding governed staging/production release workflow."
