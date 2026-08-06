import { NextResponse } from "next/server";

import {
  appleProProductId,
  appleTransactionIsActive,
  verifyStoreKitTransactionJws,
} from "@/lib/apple-billing";
import { appendAudit } from "@/lib/audit-log";
import { clientIp, userAgent } from "@/lib/request-context";
import { readVerifiedSession } from "@/lib/session-cookie";
import { updateUserAppleBilling } from "@/lib/user-data-store";

export const runtime = "nodejs";

/**
 * POST /api/billing/apple/verify
 * Body: { signedTransaction: string } — StoreKit 2 Transaction.jwsRepresentation
 */
export async function POST(request: Request) {
  const session = await readVerifiedSession(request);
  if (!session?.userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { signedTransaction?: string };
    if (!body.signedTransaction) {
      return NextResponse.json({ error: "signedTransaction required." }, { status: 400 });
    }

    const tx = await verifyStoreKitTransactionJws(body.signedTransaction);
    if (!appleTransactionIsActive(tx)) {
      await updateUserAppleBilling(session.userId, {
        plan: "free",
        appleOriginalTransactionId: tx.originalTransactionId || null,
      });
      return NextResponse.json({ ok: true, plan: "free", reason: "expired" });
    }

    if (tx.productId && tx.productId !== appleProProductId()) {
      return NextResponse.json({ error: "Unknown product." }, { status: 400 });
    }

    // appAccountToken should match our userId when set from the client
    if (tx.appAccountToken && tx.appAccountToken !== session.userId) {
      return NextResponse.json({ error: "Transaction does not belong to this account." }, { status: 403 });
    }

    await updateUserAppleBilling(session.userId, {
      plan: "pro",
      appleOriginalTransactionId: tx.originalTransactionId,
      appleProductId: tx.productId || appleProProductId(),
      appleEnvironment: tx.environment,
    });

    await appendAudit({
      action: "billing.upgrade",
      outcome: "success",
      userId: session.userId,
      ip: clientIp(request),
      userAgent: userAgent(request),
      meta: {
        method: "apple_iap",
        productId: tx.productId,
        originalTransactionId: tx.originalTransactionId,
        environment: tx.environment,
      },
    });

    return NextResponse.json({
      ok: true,
      plan: "pro",
      productId: tx.productId,
      originalTransactionId: tx.originalTransactionId,
    });
  } catch (e) {
    console.error("[apple iap verify]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Verification failed." },
      { status: 400 },
    );
  }
}
