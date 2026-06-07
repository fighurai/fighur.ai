import Stripe from "stripe";

import { getSiteUrl } from "@/lib/site-url";

export function stripeCheckoutConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PRICE_ID?.trim());
}

export function stripeConfigured(): boolean {
  return stripeCheckoutConfigured() && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

export function stripePublishableKey(): string | null {
  const key =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  return key || null;
}

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  if (!client) {
    client = new Stripe(key);
  }
  return client;
}

export function proPriceId(): string {
  const id = process.env.STRIPE_PRICE_ID?.trim();
  if (!id) throw new Error("STRIPE_PRICE_ID is not configured.");
  return id;
}

export function billingReturnUrls(): { success: string; cancel: string } {
  const base = getSiteUrl();
  return {
    success: `${base}/?upgraded=pro`,
    cancel: `${base}/upgrade?canceled=1`,
  };
}
