This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel (fighur.ai)

Chat requires **at least one** model API key on the **fighur.ai** Vercel project (not a different project):

| Variable | Provider |
|----------|----------|
| `ANTHROPIC_API_KEY` | Claude |
| `GROQ_API_KEY` | Groq (free tier at [console.groq.com](https://console.groq.com)) |
| `OPENAI_API_KEY` | OpenAI |
| `OPENROUTER_API_KEY` | OpenRouter |
| `NVIDIA_API_KEY` | NVIDIA NIM |

Set for **Production**, then **Redeploy**. See `env.example` for OAuth and `SMILE_APP_SECRET`.

**Same flow as code edits:** add keys as [GitHub Actions secrets](docs/GITHUB-SECRETS.md) (`VERCEL_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …). Each push to `main` runs `.github/workflows/sync-vercel-env.yml` and copies them to Vercel — nothing secret is committed to git.

Verify: `https://fighur.ai/api/chat/models` should show `"chatReady": true` and some `"available": true` models.
