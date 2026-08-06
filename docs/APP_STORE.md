# App Store readiness (FIGHURAI)

Research basis: [Apple Developer Program](https://developer.apple.com/programs/), [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/).

## Done in this repo (web compliance)

| Item | Location |
|------|----------|
| Privacy Policy URL | https://fighur.ai/privacy |
| Terms of Use URL | https://fighur.ai/terms |
| Support URL | https://fighur.ai/support |
| In-app account deletion | Settings → Account → Delete account (`DELETE /api/auth/account`) |

Use these three URLs in App Store Connect → App Information.

## You must do in Apple’s systems

1. Enroll in the **Apple Developer Program** ($99/yr) with 2FA on your Apple Account.  
   - Individual: your legal name is the seller.  
   - Organization: legal entity + **D-U-N-S** (free in most regions).
2. Create the app in **App Store Connect** (suggested bundle ID: `ai.fighur.app`).
3. Enable capabilities: Sign in with Apple, In-App Purchase, Push (if used).
4. Provide a **non-expiring demo account** in App Review Information.
5. Answer **age rating** questions and disclose **AI-generated content**.
6. Upload **Privacy Nutrition Labels** (chat content, email, identifiers, usage data; third-party AI sharing).
7. Ship builds with **Xcode 26 / iOS 26 SDK** (required for uploads after Apr 28, 2026).

## Still required in product before approval

| Gap | Why Apple cares | Next engineering step |
|-----|-----------------|------------------------|
| Native iOS binary | Cannot list a website alone | Capacitor/hybrid shell (Path B): native auth/IAP + WebView for chat |
| Sign in with Apple | Guideline **4.8** — Google/Microsoft SSO already exist | Add Apple SSO alongside Google/Microsoft |
| StoreKit IAP for Pro | Guideline **3.1.1** — digital subscriptions | Mirror Stripe Pro entitlements via App Store subscriptions; hide Stripe checkout inside iOS |
| PrivacyInfo.xcprivacy | Required on upload | Declare Required Reason APIs used by the binary/SDKs |
| Minimum functionality **4.2** | Thin WebView wrappers get rejected | Native chrome: Sign in with Apple, IAP, Share, optional push |

## Recommended ship order

0. Enroll + create App ID  
1. Legal URLs (done) + account deletion (done)  
2. Sign in with Apple (needs Services ID + key from you)  
3. StoreKit products + server receipt validation  
4. iOS hybrid shell + TestFlight  
5. Screenshots + submit  

## Notes for Review (draft)

> FIGHURAI is an AI assistant. Demo account: [fill]. Sign in with email. Chat may call third-party LLMs (Anthropic/OpenAI/etc.) with the user’s prompt. Account deletion: Settings → Account. Subscriptions on iOS use In-App Purchase; web billing is Stripe.

Do not paste secrets into this file.
