#!/usr/bin/env bash
# Used by .github/workflows/sync-vercel-env.yml — syncs GitHub Actions secrets → Vercel project env.
set -euo pipefail

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "Skip: VERCEL_TOKEN not set in GitHub Actions secrets."
  exit 0
fi

export VERCEL_TOKEN
PROJECT="${VERCEL_PROJECT:-fighur.ai}"
SCOPE_ARGS=()
if [[ -n "${VERCEL_ORG_ID:-}" ]]; then
  SCOPE_ARGS=(--scope "$VERCEL_ORG_ID")
elif [[ -n "${VERCEL_TEAM_ID:-}" ]]; then
  SCOPE_ARGS=(--team "$VERCEL_TEAM_ID")
fi

cd "$(dirname "$0")/.."

echo "Linking Vercel project: $PROJECT"
npx vercel@latest link --project "$PROJECT" "${SCOPE_ARGS[@]}" --yes --token "$VERCEL_TOKEN"

upsert_env() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "Skip $name (not in GitHub secrets)"
    return
  fi
  for env in production preview; do
    echo "Setting $name ($env)..."
    printf '%s' "$value" | npx vercel@latest env add "$name" "$env" "${SCOPE_ARGS[@]}" --token "$VERCEL_TOKEN" --force --yes 2>/dev/null \
      || printf '%s' "$value" | npx vercel@latest env add "$name" "$env" "${SCOPE_ARGS[@]}" --token "$VERCEL_TOKEN" --yes
  done
}

upsert_env ANTHROPIC_API_KEY "${ANTHROPIC_API_KEY:-}"
upsert_env OPENAI_API_KEY "${OPENAI_API_KEY:-}"
upsert_env OPENROUTER_API_KEY "${OPENROUTER_API_KEY:-}"
upsert_env GROQ_API_KEY "${GROQ_API_KEY:-}"
upsert_env SMILE_APP_SECRET "${SMILE_APP_SECRET:-}"
upsert_env SMILE_OAUTH_COOKIE_SECRET "${SMILE_OAUTH_COOKIE_SECRET:-}"
upsert_env NEXT_PUBLIC_SITE_URL "${NEXT_PUBLIC_SITE_URL:-https://fighur.ai}"
upsert_env SMILE_OAUTH_BASE_URL "${SMILE_OAUTH_BASE_URL:-https://fighur.ai}"
upsert_env SMILE_DEFAULT_CHAT_MODEL "${SMILE_DEFAULT_CHAT_MODEL:-}"
upsert_env GOOGLE_CLIENT_ID "${GOOGLE_CLIENT_ID:-}"
upsert_env GOOGLE_CLIENT_SECRET "${GOOGLE_CLIENT_SECRET:-}"
upsert_env MICROSOFT_CLIENT_ID "${MICROSOFT_CLIENT_ID:-}"
upsert_env MICROSOFT_CLIENT_SECRET "${MICROSOFT_CLIENT_SECRET:-}"
echo "Requesting production redeploy so new env vars apply..."
npx vercel@latest deploy --prod "${SCOPE_ARGS[@]}" --token "$VERCEL_TOKEN" --yes

echo "Done. Check https://fighur.ai/api/chat/models for chatReady: true"
