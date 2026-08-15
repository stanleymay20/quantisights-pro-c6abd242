#!/usr/bin/env bash
set -Eeuo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF must be set}"

MAX_ATTEMPTS="${SUPABASE_FUNCTION_DEPLOY_MAX_ATTEMPTS:-5}"
BASE_DELAY_SECONDS="${SUPABASE_FUNCTION_DEPLOY_BASE_DELAY_SECONDS:-5}"
PACE_SECONDS="${SUPABASE_FUNCTION_DEPLOY_PACE_SECONDS:-2}"
PRUNE_STALE_REMOTE_FUNCTIONS="${SUPABASE_PRUNE_STALE_REMOTE_FUNCTIONS:-false}"
REMOTE_FUNCTION_COUNT=0
STALE_REMOTE_COUNT=0

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

if [[ "$PRUNE_STALE_REMOTE_FUNCTIONS" != "true" && "$PRUNE_STALE_REMOTE_FUNCTIONS" != "false" ]]; then
  echo "::error::SUPABASE_PRUNE_STALE_REMOTE_FUNCTIONS must be true or false"
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

  if grep -Fqi 'Max number of functions reached' <<<"$output"; then
    echo "::error title=Supabase Edge function quota reached::Repository functions: ${#functions[@]}; remote functions before deployment: ${REMOTE_FUNCTION_COUNT}; stale remote functions detected: ${STALE_REMOTE_COUNT}. Only proven stale remote functions may be removed. If stale count is zero, increase the project function allowance or use the intended staging project."
  fi

  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      printf '### Supabase Edge deployment failure\n\n'
      printf -- '- Function: `%s`\n' "$function_name"
      printf -- '- Project: `%s`\n' "$SUPABASE_PROJECT_REF"
      printf -- '- Repository function count: `%s`\n' "${#functions[@]}"
      printf -- '- Remote function count before deployment: `%s`\n' "$REMOTE_FUNCTION_COUNT"
      printf -- '- Proven stale remote functions: `%s`\n\n' "$STALE_REMOTE_COUNT"
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

declare -A local_function_set=()
for function_name in "${functions[@]}"; do
  local_function_set["$function_name"]=1
done

reconcile_remote_inventory() {
  local remote_json
  local remote_stderr
  local remote_stderr_file
  local list_status
  local -a remote_functions=()
  local -a stale_remote_functions=()

  if ! command -v jq >/dev/null 2>&1; then
    echo "::error::jq is required to reconcile Supabase Edge Function inventory safely."
    exit 1
  fi

  # Supabase CLI JSON output is emitted on stdout. Keep stderr separate so
  # warnings/progress messages cannot corrupt the machine-readable inventory.
  remote_stderr_file="$(mktemp)"
  set +e
  remote_json="$(supabase functions list \
    --project-ref "$SUPABASE_PROJECT_REF" \
    --output json 2>"$remote_stderr_file")"
  list_status=$?
  set -e
  remote_stderr="$(cat "$remote_stderr_file")"
  rm -f "$remote_stderr_file"

  if [ -n "$remote_stderr" ]; then
    printf '%s\n' "$remote_stderr" >&2
  fi

  if [ "$list_status" -ne 0 ]; then
    if [ -n "$remote_json" ]; then
      printf '%s\n' "$remote_json"
    fi
    echo "::error::Unable to obtain remote Supabase Edge Function inventory for $SUPABASE_PROJECT_REF."
    exit "$list_status"
  fi

  if ! jq -e 'type == "array"' >/dev/null 2>&1 <<<"$remote_json"; then
    printf '%s\n' "$remote_json"
    echo "::error::Supabase Edge Function inventory stdout was not the documented JSON array; refusing unsafe reconciliation."
    exit 1
  fi

  mapfile -t remote_functions < <(
    jq -r '.[] | (.slug // .name // empty)' <<<"$remote_json" | sed '/^$/d' | sort -u
  )

  REMOTE_FUNCTION_COUNT="${#remote_functions[@]}"

  for function_name in "${remote_functions[@]}"; do
    if [[ -z "${local_function_set[$function_name]+x}" ]]; then
      stale_remote_functions+=("$function_name")
    fi
  done

  STALE_REMOTE_COUNT="${#stale_remote_functions[@]}"

  echo "Supabase Edge inventory before deployment: ${#functions[@]} repository functions, ${REMOTE_FUNCTION_COUNT} remote functions, ${STALE_REMOTE_COUNT} proven stale remote functions."

  if [ "$STALE_REMOTE_COUNT" -eq 0 ]; then
    return 0
  fi

  printf 'Proven stale remote functions (present remotely, absent from repository): %s\n' "${stale_remote_functions[*]}"

  if [ "$PRUNE_STALE_REMOTE_FUNCTIONS" != "true" ]; then
    echo "::warning::Stale remote functions were detected but automatic deletion is disabled."
    return 0
  fi

  for function_name in "${stale_remote_functions[@]}"; do
    echo "Deleting proven stale remote Edge Function: ${function_name}"
    supabase functions delete "$function_name" --project-ref "$SUPABASE_PROJECT_REF"
  done

  REMOTE_FUNCTION_COUNT=$((REMOTE_FUNCTION_COUNT - STALE_REMOTE_COUNT))
  echo "Deleted ${STALE_REMOTE_COUNT} proven stale remote Edge Functions before deployment."
  STALE_REMOTE_COUNT=0
}

reconcile_remote_inventory

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
