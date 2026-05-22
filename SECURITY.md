# FIGHURAI Security & Compliance

This document describes security controls implemented in the application. **SOC 2 Type II certification** requires organizational policies, third-party audits, and operational procedures beyond application code.

## Implemented controls

| Control | Implementation |
|--------|----------------|
| Authentication | Password (scrypt), Google SSO, Microsoft SSO |
| Session security | AES-256-GCM sealed httpOnly cookies (`SMILE_APP_SECRET`) |
| RBAC | Roles: `user`, `viewer`, `admin` with permission checks on chat |
| Audit logs | Append-only JSONL in `.data/audit/` and per-user `users/{id}/audit/` |
| Data isolation | Per-user directory `users/{uuid}/` (profile, OAuth, usage, conversations) |
| Usage gate | Anonymous trial capped at **$5** estimated token spend; sign-up required to continue |
| Plans | **Free** = unlimited Claude · **Pro** = all models (Stripe hook planned) |
| Transport | HSTS, `X-Frame-Options`, `nosniff` via middleware |
| OAuth integrations | PKCE, sealed pending state, per-user encrypted token files |

## Environment variables

See `env.example`. Required for production:

- `SMILE_APP_SECRET` (16+ characters)
- `SMILE_USER_DATA_DIR` (persistent volume on serverless)
- Provider API keys and OAuth client credentials for SSO

Google SSO: see `docs/GOOGLE_SSO_SETUP.md`. Check deployment with `GET /api/auth/providers`.

## Operations (SOC 2 alignment)

- Restrict filesystem access to `SMILE_USER_DATA_DIR`
- Rotate `SMILE_APP_SECRET` on compromise (invalidates all sessions)
- Export audit logs to SIEM for retention
- Enable Vercel/deployment access reviews and change management

## Not included (future)

- Email verification, MFA, Stripe billing, Postgres/Supabase migration
- Formal penetration testing and SOC 2 audit engagement
