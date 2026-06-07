import { NextResponse } from "next/server";

import { appendAudit } from "@/lib/audit-log";
import { readVerifiedSession } from "@/lib/session-cookie";
import {
  billingReturnUrls,
  getStripe,
  proPriceId,
  stripeCheckoutConfigured,
} from "@/lib/stripe-billing";
import { readUserProfile } from "@/lib/user-data-store";
import { clientIp, userAgent } from "@/lib/request-context";

export async function POST(request: Request) {
  if (!stripeCheckoutConfigured()) {
    return NextResponse.json(
      {
        error: "Stripe billing is not configured yet.",
        code: "BILLING_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const profile = await readUserProfile(session.userId);
  if (!profile) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  if (profile.plan === "pro") {
    return NextResponse.json({
      ok: true,
      alreadyPro: true,
      message: "You already have Pro.",
    });
  }

  const stripe = getStripe();
  const { success, cancel } = billingReturnUrls();

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: profile.stripeCustomerId || undefined,
    customer_email: profile.stripeCustomerId ? undefined : profile.email,
    line_items: [{ price: proPriceId(), quantity: 1 }],
    success_url: success,
    cancel_url: cancel,
    client_reference_id: profile.userId,
    metadata: {
      userId: profile.userId,
      email: profile.email,
    },
    subscription_data: {
      metadata: {
        userId: profile.userId,
      },
    },
    allow_promotion_codes: true,
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }

  await appendAudit({
    action: "billing.upgrade",
    outcome: "success",
    userId: profile.userId,
    ip: clientIp(request),
    userAgent: userAgent(request),
    meta: { method: "stripe_checkout", sessionId: checkoutSession.id },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
