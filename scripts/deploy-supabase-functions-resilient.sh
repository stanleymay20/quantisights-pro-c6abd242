#!/usr/bin/env bash
set -Eeuo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF must be set}"

MAX_ATTEMPTS="${SUPABASE_FUNCTION_DEPLOY_MAX_ATTEMPTS:-5}"
BASE_DELAY_SECONDS="${SUPABASE_FUNCTION_DEPLOY_BASE_DELAY_SECONDS:-5}"
PACE_SECONDS="${SUPABASE_FUNCTION_DEPLOY_PACE_SECONDS:-2}"

if ! [[ "$MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "::error::SUPABASE_FUNCTION_DEPLOY_MAX_ATTEMPTS must be a positive integer"
  exit 2
fi

if ! [[ "$BASE_DELAY_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "::error::SUPABASE_FUNCTION_DEPLOY_BASE_DELAY_SECONDS must be a non-negative integer"
  exit 2
fi

if ! [[ "$PACE_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "::error::SUPABASE_FUNCTION_DEPLOY_PACE_SECONDS must be a non-negative integer"
  exit 2
fi

is_transient_failure() {
  local output="$1"
  grep -Eqi \
    '(http[^0-9]*(429|500|502|503|504)|status[^0-9]*(429|500|502|503|504)|error code:[[:space:]]*(429|500|502|503|504)|throttlerexception|timed? out|timeout|temporar(y|ily)|connection reset|unexpected eof|service unavailable|bad gateway|gateway timeout|too many requests)' \
    <<<"$output"
}

report_deployment_failure() {
  local function_name="$1"
  local output="$2"
  local escaped_output="$output"

  # GitHub workflow commands require percent/newline/carriage-return escaping.
  # Preserve the original Supabase CLI error in the check annotation so failed
  # deployments remain diagnosable even when the full job log is unavailable.
  escaped_output="${escaped_output//'%'/'%25'}"
  escaped_output="${escaped_output//$'\r'/'%0D'}"
  escaped_output="${escaped_output//$'\n'/'%0A'}"
  echo "::error title=Supabase Edge deploy failed: ${function_name}::${escaped_output}"

  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      printf '### Supabase Edge deployment failure\n\n'
      printf -- '- Function: `%s`\n' "$function_name"
      printf -- '- Project: `%s`\n\n' "$SUPABASE_PROJECT_REF"
      printf '```text\n%s\n```\n' "$output"
    } >>"$GITHUB_STEP_SUMMARY"
  fi
}

mapfile -t functions < <(
  find supabase/functions \
    -mindepth 2 \
    -maxdepth 2 \
    -type f \
    -name index.ts \
    -printf '%h\n' \
    | sed 's#^supabase/functions/##' \
    | sort -u
)

if [ "${#functions[@]}" -eq 0 ]; then
  echo "::error::No Supabase Edge Functions were discovered."
  exit 1
fi

echo "Deploying ${#functions[@]} Supabase Edge Functions serially with ${PACE_SECONDS}s pacing."

for function_name in "${functions[@]}"; do
  delay="$BASE_DELAY_SECONDS"
  deployed=false

  for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
    echo "Deploying ${function_name} (attempt ${attempt}/${MAX_ATTEMPTS})..."

    set +e
    output="$(supabase functions deploy "$function_name" \
      --project-ref "$SUPABASE_PROJECT_REF" \
      --use-api 2>&1)"
    status=$?
    set -e

    printf '%s\n' "$output"

    if [ "$status" -eq 0 ]; then
      deployed=true
      break
    fi

    if ! is_transient_failure "$output"; then
      report_deployment_failure "$function_name" "$output"
      exit "$status"
    fi

    if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
      report_deployment_failure "$function_name" "$output"
      echo "::error::${function_name} exhausted ${MAX_ATTEMPTS} attempts after transient Supabase/API failures."
      exit "$status"
    fi

    echo "Transient Supabase/API failure for ${function_name}. Retrying after ${delay}s."
    sleep "$delay"
    delay=$((delay * 2))
  done

  if [ "$deployed" != "true" ]; then
    echo "::error::${function_name} did not reach a successful deployment state."
    exit 1
  fi

  if [ "$PACE_SECONDS" -gt 0 ]; then
    sleep "$PACE_SECONDS"
  fi
done

echo "Successfully deployed all ${#functions[@]} Supabase Edge Functions."
