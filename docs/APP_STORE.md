# App Store readiness (FIGHURAI)

Research: [Apple Developer Program](https://developer.apple.com/programs/) · [Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## Your job (subscription / Apple account)

1. Enroll in the **Apple Developer Program** ($99/yr) at https://developer.apple.com/programs/enroll/
2. In App Store Connect, create app **FIGHURAI** with bundle ID **`ai.fighur.app`**
3. Create:
   - **Services ID** for Sign in with Apple (e.g. `ai.fighur.app.web`)
   - Return URL: `https://fighur.ai/api/auth/sso/apple/callback`
   - **Sign in with Apple key** (.p8) + Key ID + Team ID
   - Auto-renewable **subscription** product (suggested: `ai.fighur.app.pro.monthly`)
   - App Store Server Notifications V2 → `https://fighur.ai/api/billing/apple/notifications`
4. Paste secrets into Vercel (see `env.example` `APPLE_*` section) and redeploy
5. On a Mac with Xcode: `npm run ios:add && npm run cap:sync && npm run cap:open`
6. Copy `native/ios-templates/PrivacyInfo.xcprivacy` into the Xcode target
7. Wire `FigHurIAP.swift.template` (StoreKit bridge) for IAP
8. Archive → TestFlight → Submit

## Already implemented in this repo

| Item | Where |
|------|--------|
| Privacy / Terms / Support | `/privacy` `/terms` `/support` |
| Account deletion | Settings → Account · `DELETE /api/auth/account` |
| Sign in with Apple (web) | `/api/auth/sso/apple` + callback form_post |
| Sign in with Apple (native) | `POST /api/auth/sso/apple/native` |
| Apple buttons | Sign-in / Sign-up pages |
| IAP verify | `POST /api/billing/apple/verify` |
| ASN V2 webhook | `POST /api/billing/apple/notifications` |
| Hide Stripe on iOS | Upgrade page + checkout API blocks Capacitor UA |
| Capacitor shell | `capacitor.config.ts` · `native/www` · loads https://fighur.ai |
| Privacy manifest template | `native/ios-templates/PrivacyInfo.xcprivacy` |
| StoreKit bridge template | `native/ios-templates/FigHurIAP.swift.template` |

## Env vars (Vercel)

```
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_SERVICES_ID=ai.fighur.app.web
APPLE_BUNDLE_ID=ai.fighur.app
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
APPLE_IAP_PRODUCT_ID=ai.fighur.app.pro.monthly
NEXT_PUBLIC_APPLE_IAP_PRODUCT_ID=ai.fighur.app.pro.monthly
```

## App Store Connect listing URLs

- Privacy: https://fighur.ai/privacy  
- Terms: https://fighur.ai/terms  
- Support: https://fighur.ai/support  

## Notes for Review (draft)

> FIGHURAI is an AI assistant. Demo: [email/password]. Sign in with Apple is available. Chat may call third-party LLMs with the user’s prompt. Account deletion: Settings → Account. iOS subscriptions use In-App Purchase; web uses Stripe.
