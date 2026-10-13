#!/usr/bin/env bash
# Rebuilds the TEST Supabase project from scratch:
#   1. wipes the public and private schemas
#   2. re-applies every migration in supabase/migrations, in order
#   3. optionally makes two accounts for trying the app by hand (the automated tests make their own)
#
# Usage (set the values first, never commit them):
#   export TEST_PROJECT_REF=<test project ref>
#   export SUPABASE_SERVICE_ROLE_KEY=<test project service role key>
#   export TEST_ACCOUNT_PASSWORD=<password>   (optional: only for test01/test02 to log in by hand)
#   bash supabase/scripts/reset-test-project.sh

set -euo pipefail

LIVE_PROJECT_REF="bxkiuaapyiflnmqhodgm"

: "${TEST_PROJECT_REF:?Set TEST_PROJECT_REF to the test project ref}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY for the test project}"

if [ "$TEST_PROJECT_REF" = "$LIVE_PROJECT_REF" ]; then
  echo "Refusing to run: TEST_PROJECT_REF is the live project ($LIVE_PROJECT_REF)." >&2
  exit 1
fi

cd "$(dirname "$0")/../.."

supabase link --project-ref "$TEST_PROJECT_REF"

echo "Step 1: wipe the schemas. Open the TEST project's SQL editor, paste"
echo "        supabase/scripts/reset-test-project.sql, and run it."
read -r -p "Press Enter once that has finished (Ctrl+C to stop)..."

echo "Applying migrations..."
supabase db push --linked --include-all

if [ -n "${TEST_ACCOUNT_PASSWORD:-}" ]; then
  echo "Creating accounts for trying the app by hand..."
  SUPABASE_URL="https://$TEST_PROJECT_REF.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  TEST_ACCOUNT_PASSWORD="$TEST_ACCOUNT_PASSWORD" \
  node supabase/scripts/create-test-accounts.mjs
fi

echo "Done. Next: deploy the Edge Functions and secrets to the test project (see the test plan)."
