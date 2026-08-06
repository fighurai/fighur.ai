import { NextResponse } from "next/server";

import {
  appleTransactionIsActive,
  decodeAppleNotification,
} from "@/lib/apple-billing";
import { appendAudit } from "@/lib/audit-log";
import {
  findUserIdByAppleOriginalTransactionId,
  updateUserAppleBilling,
} from "@/lib/user-data-store";

export const runtime = "nodejs";

/**
 * App Store Server Notifications V2
 * Configure URL: https://fighur.ai/api/billing/apple/notifications
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { signedPayload?: string };
    if (!body.signedPayload) {
      return NextResponse.json({ error: "signedPayload required." }, { status: 400 });
    }

    const { notification, transaction } = await decodeAppleNotification(body.signedPayload);
    if (!transaction?.originalTransactionId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    let userId =
      (transaction.appAccountToken &&
      /^[0-9a-f-]{36}$/i.test(transaction.appAccountToken)
        ? transaction.appAccountToken
        : null) ||
      (await findUserIdByAppleOriginalTransactionId(transaction.originalTransactionId));

    if (!userId) {
      return NextResponse.json({ ok: true, unmatched: true });
    }

    const type = notification.notificationType || "";
    const cancelTypes = new Set([
      "EXPIRED",
      "REVOKE",
      "GRACE_PERIOD_EXPIRED",
      "REFUND",
    ]);

    if (cancelTypes.has(type) || !appleTransactionIsActive(transaction)) {
      await updateUserAppleBilling(userId, {
        plan: "free",
        appleOriginalTransactionId: transaction.originalTransactionId,
      });
      await appendAudit({
        action: "billing.upgrade",
        outcome: "success",
        userId,
        ip: "apple-asn",
        userAgent: "apple",
        meta: { method: "apple_notification", type, plan: "free" },
      });
    } else {
      await updateUserAppleBilling(userId, {
        plan: "pro",
        appleOriginalTransactionId: transaction.originalTransactionId,
        appleProductId: transaction.productId,
        appleEnvironment: transaction.environment,
      });
      await appendAudit({
        action: "billing.upgrade",
        outcome: "success",
        userId,
        ip: "apple-asn",
        userAgent: "apple",
        meta: { method: "apple_notification", type, plan: "pro" },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[apple notifications]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bad notification." },
      { status: 400 },
    );
  }
}
