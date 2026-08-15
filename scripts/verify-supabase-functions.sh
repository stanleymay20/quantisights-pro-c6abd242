#!/usr/bin/env bash
set -Eeuo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF must be set}"

if ! command -v jq >/dev/null 2>&1; then
  echo "::error::jq is required to verify Supabase Edge Function inventory safely."
  exit 1
fi

mapfile -t expected_functions < <(
  find supabase/functions \
    -mindepth 2 \
    -maxdepth 2 \
    -type f \
    -name index.ts \
    -printf '%h\n' \
    | sed 's#^supabase/functions/##' \
    | sort -u
)

if [ "${#expected_functions[@]}" -eq 0 ]; then
  echo "::error::No local Supabase Edge Functions were discovered."
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
  echo "::error::Supabase Edge Function inventory stdout was not the documented JSON array."
  exit 1
fi

mapfile -t remote_functions < <(
  jq -r '.[] | (.slug // .name // empty)' <<<"$remote_json" | sed '/^$/d' | sort -u
)

declare -A expected_set=()
declare -A remote_set=()

for function_name in "${expected_functions[@]}"; do
  expected_set["$function_name"]=1
done

for function_name in "${remote_functions[@]}"; do
  remote_set["$function_name"]=1
done

missing=()
for function_name in "${expected_functions[@]}"; do
  if [[ -z "${remote_set[$function_name]+x}" ]]; then
    missing+=("$function_name")
  fi
done

unexpected=()
for function_name in "${remote_functions[@]}"; do
  if [[ -z "${expected_set[$function_name]+x}" ]]; then
    unexpected+=("$function_name")
  fi
done

printf 'Repository Edge Functions: %s; remote Edge Functions: %s\n' \
  "${#expected_functions[@]}" "${#remote_functions[@]}"

if [ "${#missing[@]}" -gt 0 ]; then
  printf '::error::The following repository Edge Functions are missing from project %s: %s\n' \
    "$SUPABASE_PROJECT_REF" "${missing[*]}"
fi

if [ "${#unexpected[@]}" -gt 0 ]; then
  printf '::error::The following remote Edge Functions are absent from the repository and must be explicitly reconciled: %s\n' \
    "${unexpected[*]}"
fi

if [ "${#missing[@]}" -gt 0 ] || [ "${#unexpected[@]}" -gt 0 ]; then
  exit 1
fi

echo "Verified exact Edge Function inventory parity for ${#expected_functions[@]} functions."
