#!/usr/bin/env bash
set -Eeuo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF must be set}"

function_list="$(supabase functions list --project-ref "$SUPABASE_PROJECT_REF")"
printf '%s\n' "$function_list"

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

missing=()
for function_name in "${expected_functions[@]}"; do
  if ! grep -Fq "$function_name" <<<"$function_list"; then
    missing+=("$function_name")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  printf '::error::The following local Edge Functions are missing from project %s: %s\n' \
    "$SUPABASE_PROJECT_REF" "${missing[*]}"
  exit 1
fi

echo "Verified ${#expected_functions[@]} deployed Edge Functions against the repository inventory."
