import type { Metadata } from "next";
import Link from "next/link";

import { LegalShell } from "@/components/legal-shell";
import { SITE_TITLE } from "@/lib/site-brand";

export const metadata: Metadata = {
  title: "Support",
  description: `Get help with ${SITE_TITLE}.`,
};

export default function SupportPage() {
  return (
    <LegalShell title="Support">
      <p>
        We’re here to help with accounts, billing, connectors, and product questions for {SITE_TITLE}.
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">Contact</h2>
      <p>
        Email{" "}
        <a className="text-[var(--accent)] underline" href="mailto:hello@fighurai.com">
          hello@fighurai.com
        </a>{" "}
        and include your account email plus a short description of the issue.
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">Common requests</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong className="text-[var(--text-primary)]">Delete my account:</strong> Settings →
          Account → Delete account (signed in), or email us from the address on the account.
        </li>
        <li>
          <strong className="text-[var(--text-primary)]">Billing:</strong> Web subscriptions via
          Stripe; App Store purchases are managed in Apple ID → Subscriptions.
        </li>
        <li>
          <strong className="text-[var(--text-primary)]">Disconnect Google / Microsoft:</strong>{" "}
          Settings → Connectors.
        </li>
      </ul>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">Policies</h2>
      <p>
        <Link className="text-[var(--accent)] underline" href="/privacy">
          Privacy Policy
        </Link>{" "}
        ·{" "}
        <Link className="text-[var(--accent)] underline" href="/terms">
          Terms of Use
        </Link>
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">App Store review</h2>
      <p>
        Apple App Review: use the demo account credentials provided in App Store Connect “Notes for
        Review,” or contact{" "}
        <a className="text-[var(--accent)] underline" href="mailto:hello@fighurai.com">
          hello@fighurai.com
        </a>{" "}
        with the subject line “App Review”.
      </p>
    </LegalShell>
  );
}
