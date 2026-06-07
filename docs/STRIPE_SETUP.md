# Stripe Pro billing on fighur.ai

## 1. Stripe Dashboard (test mode)

1. [API keys](https://dashboard.stripe.com/test/apikeys) — copy **Secret key** (`sk_test_…`)
2. [Products](https://dashboard.stripe.com/test/products) → **Add product** → recurring price (e.g. FIGHURAI Pro monthly)
3. Copy the **Price ID** (`price_…`)

## 2. Vercel environment variables

| Variable | Example |
|----------|---------|
| `STRIPE_SECRET_KEY` | `sk_test_…` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` (you already have this) |
| `STRIPE_PRICE_ID` | `price_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (step 3) |

Push via GitHub Secrets + sync workflow, or:

```bash
cd smile-ai
VERCEL_TOKEN=... python3 scripts/push-vercel-env-api.py
```

## 3. Webhook

1. [Webhooks](https://dashboard.stripe.com/test/webhooks) → **Add endpoint**
2. URL: `https://fighur.ai/api/billing/webhook`
3. Events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

## 4. Test

1. Sign in at [fighur.ai](https://fighur.ai)
2. Open [/upgrade](https://fighur.ai/upgrade) → **Upgrade to Pro**
3. Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC
4. After payment, model picker should show all providers (Pro plan)

## Local dev

Use [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward webhooks:

```bash
stripe listen --forward-to localhost:3099/api/billing/webhook
```

Set `STRIPE_WEBHOOK_SECRET` to the secret printed by `stripe listen`.
