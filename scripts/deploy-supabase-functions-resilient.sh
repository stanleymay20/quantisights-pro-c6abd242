#!/usr/bin/env bash
set -Eeuo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF must be set}"

MAX_ATTEMPTS="${SUPABASE_FUNCTION_DEPLOY_MAX_ATTEMPTS:-4}"
JOBS="${SUPABASE_FUNCTION_DEPLOY_JOBS:-2}"
BASE_DELAY_SECONDS="${SUPABASE_FUNCTION_DEPLOY_BASE_DELAY_SECONDS:-5}"

if ! [[ "$MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "::error::SUPABASE_FUNCTION_DEPLOY_MAX_ATTEMPTS must be a positive integer"
  exit 2
fi

if ! [[ "$JOBS" =~ ^[1-9][0-9]*$ ]]; then
  echo "::error::SUPABASE_FUNCTION_DEPLOY_JOBS must be a positive integer"
  exit 2
fi

if ! [[ "$BASE_DELAY_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "::error::SUPABASE_FUNCTION_DEPLOY_BASE_DELAY_SECONDS must be a non-negative integer"
  exit 2
fi

is_transient_failure() {
  local output="$1"
  grep -Eqi \
    '(http[^0-9]*(429|500|502|503|504)|status[^0-9]*(429|500|502|503|504)|error code:[[:space:]]*(429|500|502|503|504)|timed? out|timeout|temporar(y|ily)|connection reset|unexpected eof|service unavailable|bad gateway|gateway timeout|too many requests)' \
    <<<"$output"
}

delay="$BASE_DELAY_SECONDS"

for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
  echo "Deploying Supabase Edge Functions (attempt ${attempt}/${MAX_ATTEMPTS}, jobs=${JOBS})..."

  set +e
  output="$(supabase functions deploy \
    --project-ref "$SUPABASE_PROJECT_REF" \
    --use-api \
    --jobs "$JOBS" 2>&1)"
  status=$?
  set -e

  printf '%s\n' "$output"

  if [ "$status" -eq 0 ]; then
    echo "Supabase Edge Function deployment succeeded on attempt ${attempt}."
    exit 0
  fi

  if ! is_transient_failure "$output"; then
    echo "::error::Edge Function deployment failed with a non-transient error; refusing to retry."
    exit "$status"
  fi

  if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
    echo "::error::Edge Function deployment exhausted ${MAX_ATTEMPTS} attempts after transient provider/API failures."
    exit "$status"
  fi

  echo "Transient Supabase/API failure detected. Retrying after ${delay}s."
  sleep "$delay"
  delay=$((delay * 2))
done
