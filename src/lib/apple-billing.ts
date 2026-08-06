/**
 * Apple In-App Purchase helpers (StoreKit 2 JWS + App Store Server Notifications V2).
 */

import { compactVerify, decodeJwt, decodeProtectedHeader, importX509 } from "jose";

export function appleIapConfigured(): boolean {
  return Boolean(process.env.APPLE_IAP_PRODUCT_ID?.trim() || process.env.APPLE_BUNDLE_ID?.trim());
}

/** App Store Connect product id for FIGHURAI Pro (subscription). */
export function appleProProductId(): string {
  return process.env.APPLE_IAP_PRODUCT_ID?.trim() || "ai.fighur.app.pro.monthly";
}

export function appleBundleId(): string {
  return process.env.APPLE_BUNDLE_ID?.trim() || "ai.fighur.app";
}

export type AppleTransactionPayload = {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  bundleId?: string;
  expiresDate?: number;
  purchaseDate?: number;
  type?: string;
  environment?: string;
  appAccountToken?: string;
};

async function verifyAppleJws(jws: string): Promise<Record<string, unknown>> {
  const header = decodeProtectedHeader(jws);
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || typeof x5c[0] !== "string") {
    throw new Error("Apple JWS missing x5c certificate.");
  }
  const pem = `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----`;
  const key = await importX509(pem, header.alg || "ES256");
  const { payload } = await compactVerify(jws, key);
  return JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
}

/**
 * Verify a StoreKit 2 signed transaction (JWS with x5c).
 */
export async function verifyStoreKitTransactionJws(
  signedTransaction: string,
): Promise<AppleTransactionPayload> {
  const allowInsecure =
    process.env.APPLE_IAP_ALLOW_UNVERIFIED === "1" || process.env.NODE_ENV !== "production";

  let payload: AppleTransactionPayload;
  try {
    payload = (await verifyAppleJws(signedTransaction)) as AppleTransactionPayload;
  } catch (err) {
    if (!allowInsecure) throw err;
    payload = decodeJwt(signedTransaction) as AppleTransactionPayload;
  }

  const productId = appleProProductId();
  const bundleId = appleBundleId();
  if (payload.productId && payload.productId !== productId) {
    throw new Error(`Unexpected productId: ${payload.productId}`);
  }
  if (payload.bundleId && payload.bundleId !== bundleId) {
    throw new Error(`Unexpected bundleId: ${payload.bundleId}`);
  }
  return payload;
}

export type AppleNotificationPayload = {
  notificationType?: string;
  subtype?: string;
  data?: {
    signedTransactionInfo?: string;
    bundleId?: string;
  };
};

export async function decodeAppleNotification(
  signedPayload: string,
): Promise<{ notification: AppleNotificationPayload; transaction?: AppleTransactionPayload }> {
  let notification: AppleNotificationPayload;
  try {
    notification = (await verifyAppleJws(signedPayload)) as AppleNotificationPayload;
  } catch {
    notification = decodeJwt(signedPayload) as AppleNotificationPayload;
  }

  let transaction: AppleTransactionPayload | undefined;
  const signedTx = notification.data?.signedTransactionInfo;
  if (signedTx) {
    transaction = await verifyStoreKitTransactionJws(signedTx);
  }
  return { notification, transaction };
}

/** Active if no expiry or expiry still in the future. */
export function appleTransactionIsActive(tx: AppleTransactionPayload): boolean {
  if (!tx.expiresDate) return true;
  return tx.expiresDate > Date.now();
}
