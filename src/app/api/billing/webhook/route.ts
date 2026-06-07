import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { appendAudit } from "@/lib/audit-log";
import { getStripe, stripeConfigured } from "@/lib/stripe-billing";
import { updateUserStripeBilling } from "@/lib/user-data-store";

export const runtime = "nodejs";

function userIdFromMetadata(meta: Stripe.Metadata | null | undefined): string | null {
  const id = meta?.userId?.trim();
  return id || null;
}

async function activatePro(
  userId: string,
  stripeCustomerId?: string | null,
  stripeSubscriptionId?: string | null,
): Promise<void> {
  await updateUserStripeBilling(userId, {
    plan: "pro",
    stripeCustomerId: stripeCustomerId || undefined,
    stripeSubscriptionId: stripeSubscriptionId || undefined,
  });
  await appendAudit({
    action: "billing.upgrade",
    outcome: "success",
    userId,
    ip: "stripe-webhook",
    userAgent: "stripe",
    meta: { method: "stripe_webhook", stripeCustomerId, stripeSubscriptionId },
  });
}

async function deactivatePro(userId: string): Promise<void> {
  await updateUserStripeBilling(userId, { plan: "free", stripeSubscriptionId: null });
  await appendAudit({
    action: "billing.upgrade",
    outcome: "success",
    userId,
    ip: "stripe-webhook",
    userAgent: "stripe",
    meta: { method: "stripe_webhook_cancel" },
  });
}

export async function POST(request: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature." }, { status: 400 });
  }

  const body = await request.text();
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!.trim();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          userIdFromMetadata(session.metadata) || session.client_reference_id?.trim() || null;
        if (!userId) break;
        await activatePro(
          userId,
          typeof session.customer === "string" ? session.customer : session.customer?.id,
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id,
        );
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = userIdFromMetadata(sub.metadata);
        if (!userId) break;
        const active = sub.status === "active" || sub.status === "trialing";
        if (active) {
          await activatePro(
            userId,
            typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
            sub.id,
          );
        } else {
          await deactivatePro(userId);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = userIdFromMetadata(sub.metadata);
        if (userId) await deactivatePro(userId);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("stripe webhook handler error", event.type, err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
