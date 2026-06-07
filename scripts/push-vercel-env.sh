#!/usr/bin/env bash
# Push model API keys to the fighur.ai Vercel project (never commit secrets).
#
# 1. Create a token: https://vercel.com/account/tokens
# 2. Export keys (use NEW keys if old ones were pasted in chat):
#      export VERCEL_TOKEN="..."
#      export ANTHROPIC_API_KEY="sk-ant-..."
#      export OPENAI_API_KEY="sk-..."
# 3. Run from repo root:
#      bash scripts/push-vercel-env.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

# Load local keys if present (gitignored); never committed.
if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  if [[ -s "$HOME/.local/share/com.vercel.cli/auth.json" ]] && grep -q '"token"' "$HOME/.local/share/com.vercel.cli/auth.json" 2>/dev/null; then
    echo "Using Vercel CLI login (auth.json)."
  else
    echo "Not logged in to Vercel CLI."
    echo "  Option A: npx vercel login   (open the device URL it prints)"
    echo "  Option B: export VERCEL_TOKEN=... from https://vercel.com/account/tokens"
    exit 1
  fi
fi

PROJECT="${VERCEL_PROJECT:-fighur.ai}"
TEAM_FLAG=()
if [[ -n "${VERCEL_TEAM_ID:-}" ]]; then
  TEAM_FLAG=(--team "$VERCEL_TEAM_ID")
fi

export VERCEL_TOKEN

add_env() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "Skip $name (empty)"
    return
  fi
  echo "Adding $name to Production..."
  printf '%s' "$value" | npx vercel@latest env add "$name" production "${TEAM_FLAG[@]}" --force --yes 2>/dev/null \
    || printf '%s' "$value" | npx vercel@latest env add "$name" production "${TEAM_FLAG[@]}" --yes
  printf '%s' "$value" | npx vercel@latest env add "$name" preview "${TEAM_FLAG[@]}" --yes 2>/dev/null || true
}

if [[ ! -f .vercel/project.json ]]; then
  echo "Linking to Vercel project: $PROJECT"
  npx vercel@latest link --project "$PROJECT" "${TEAM_FLAG[@]}" --yes
fi

add_env ANTHROPIC_API_KEY "${ANTHROPIC_API_KEY:-}"
add_env OPENAI_API_KEY "${OPENAI_API_KEY:-}"
add_env OPENROUTER_API_KEY "${OPENROUTER_API_KEY:-}"
add_env GROQ_API_KEY "${GROQ_API_KEY:-}"
add_env NVIDIA_API_KEY "${NVIDIA_API_KEY:-}"
add_env GOOGLE_CLIENT_ID "${GOOGLE_CLIENT_ID:-}"
add_env GOOGLE_CLIENT_SECRET "${GOOGLE_CLIENT_SECRET:-}"
add_env MICROSOFT_CLIENT_ID "${MICROSOFT_CLIENT_ID:-}"
add_env MICROSOFT_CLIENT_SECRET "${MICROSOFT_CLIENT_SECRET:-}"
add_env SMILE_OAUTH_BASE_URL "${SMILE_OAUTH_BASE_URL:-https://fighur.ai}"
add_env NEXT_PUBLIC_SITE_URL "${NEXT_PUBLIC_SITE_URL:-https://fighur.ai}"
add_env SMILE_APP_SECRET "${SMILE_APP_SECRET:-}"

echo ""
echo "Done. Redeploy in Vercel (Deployments → Redeploy), then check:"
echo "  https://fighur.ai/api/chat/models"
