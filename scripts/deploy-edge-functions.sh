#!/bin/bash
# Deploy all Quantivis edge functions to Supabase.
# Run from repo root: bash scripts/deploy-edge-functions.sh
#
# Prerequisites:
#   npm install -g supabase
#   supabase login
#   supabase link --project-ref itpwpnwzzitkelffttyx
#
# IMPORTANT: this script used to hardcode a fixed list of function names.
# That list was written early in the project and never kept up to date —
# by the time this was rewritten, 100+ real functions existed in
# supabase/functions/ (including counterfactual-explain, auth-rate-limiter,
# cognitive-bias-detect, causal-inference, monte-carlo-sim, stripe-webhook,
# webauthn-ceremony, and many more) that were silently never deployed by
# this script despite their source being fixed and merged to main. A fix
# living correctly in git is not the same as a fix being live — Supabase
# edge functions deploy through a completely separate pipeline from
# Lovable's frontend auto-publish, and nothing else in this repo runs
# `supabase functions deploy` automatically.
#
# This version discovers every real function directory at run time instead
# of relying on a maintained list, so it can't silently drift out of date
# again. A directory counts as deployable if it sits directly under
# supabase/functions/, is not named _shared, and contains an index.ts.

set -e
PROJECT="itpwpnwzzitkelffttyx"
FUNCTIONS_DIR="$(dirname "$0")/../supabase/functions"

echo "Deploying edge functions to $PROJECT..."
echo ""

count=0
for dir in "$FUNCTIONS_DIR"/*/; do
  fn="$(basename "$dir")"
  if [ "$fn" = "_shared" ]; then
    continue
  fi
  if [ ! -f "${dir}index.ts" ]; then
    continue
  fi
  echo "  → $fn"
  supabase functions deploy "$fn" --project-ref "$PROJECT"
  count=$((count + 1))
done

echo ""
echo "Deployed $count functions."
echo ""
echo "Done. Now push DB migration:"
echo "  supabase db push --project-ref $PROJECT"
