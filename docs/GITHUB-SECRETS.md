# API keys on fighur.ai (same repo as code edits)

Code pushes to `main` deploy via Vercel. **API keys are not stored in git.** They live in **GitHub Actions secrets** and are copied to Vercel automatically when you push.

## One-time setup

1. Open **[GitHub → fighurai/fighur.ai → Settings → Secrets and variables → Actions](https://github.com/fighurai/fighur.ai/settings/secrets/actions)**.

2. Add these **Repository secrets**:

| Secret | Required for chat |
|--------|-------------------|
| `VERCEL_TOKEN` | Yes — from [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `ANTHROPIC_API_KEY` | Yes (if you use Claude) |
| `OPENAI_API_KEY` | Yes (if you use OpenAI) |
| `OPENROUTER_API_KEY` | Optional |
| `GROQ_API_KEY` | Optional |
| `SMILE_APP_SECRET` | Yes for sign-in / OAuth (16+ random characters) |
| `GOOGLE_CLIENT_ID` | Yes for Google SSO |
| `GOOGLE_CLIENT_SECRET` | Yes for Google SSO + Gmail/Calendar connect |
| `MICROSOFT_CLIENT_ID` | Optional — Outlook & 365 connect |
| `MICROSOFT_CLIENT_SECRET` | Optional — Outlook & 365 connect |
| `SLACK_CLIENT_ID` | Optional — Slack connect |
| `SLACK_CLIENT_SECRET` | Optional — Slack connect |

3. Push to `main` or run **Actions → Sync API keys to Vercel → Run workflow**.

4. Confirm: `https://fighur.ai/api/chat/models` shows `"chatReady": true`.

After this, every push to `main` refreshes Vercel env vars and triggers a production redeploy.
