import type { Metadata } from "next";

import { LegalShell } from "@/components/legal-shell";
import { SITE_TITLE } from "@/lib/site-brand";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_TITLE} collects, uses, and shares data.`,
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>Last updated: August 6, 2026</p>
      <p>
        This Privacy Policy describes how {SITE_TITLE} (“we”, “us”) handles information when you use
        fighur.ai and related apps, including any iOS app that connects to our services.
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">1. Information we collect</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong className="text-[var(--text-primary)]">Account data:</strong> email address, name,
          authentication provider (email, Google, Microsoft, or Apple when enabled), and password
          hash if you use email sign-in.
        </li>
        <li>
          <strong className="text-[var(--text-primary)]">Usage & billing:</strong> plan status,
          approximate AI usage, and payment-related identifiers from our processors (e.g. Stripe or
          Apple In-App Purchase).
        </li>
        <li>
          <strong className="text-[var(--text-primary)]">Content you provide:</strong> chat messages,
          uploads, connectors you authorize (e.g. Gmail/Calendar/Outlook tokens), device-folder
          manifests you send, tasks, agents, and apps you create.
        </li>
        <li>
          <strong className="text-[var(--text-primary)]">Technical data:</strong> IP address, user
          agent, and basic security/audit logs needed to operate the service.
        </li>
      </ul>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">2. How we use information</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Provide, secure, and improve the assistant, apps, and account features.</li>
        <li>Route prompts to third-party AI providers you select (or that Auto routing selects).</li>
        <li>Process subscriptions and enforce plan limits.</li>
        <li>Comply with law and prevent abuse.</li>
      </ul>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">
        3. AI providers and third parties
      </h2>
      <p>
        When you chat, your prompts and necessary context may be sent to third-party model providers
        (for example Anthropic, OpenAI, or others configured for your request) to generate a
        response. Those providers process data under their own terms and privacy policies. We do not
        sell your personal information.
      </p>
      <p>
        Optional connectors (Google, Microsoft, Slack, etc.) only run after you connect them and
        accept the in-product waiver. You can disconnect them anytime in Settings.
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">4. Retention</h2>
      <p>
        We keep account and chat data while your account is active. Anonymous trial usage may be
        stored in cookies/local storage on your device. When you delete your account in Settings, we
        remove your server-side account data and associated stored content as described in the
        deletion flow (subject to short-lived backups and legal retention where required).
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">5. Your choices</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Access and update account details by signing in.</li>
        <li>Disconnect integrations in Settings.</li>
        <li>
          Delete your account in Settings → Account (or contact{" "}
          <a className="text-[var(--accent)] underline" href="mailto:hello@fighurai.com">
            hello@fighurai.com
          </a>
          ).
        </li>
      </ul>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">6. Children</h2>
      <p>
        {SITE_TITLE} is not directed to children under 13 (or the minimum age in your region). Do
        not create an account if you are under that age.
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">7. Contact</h2>
      <p>
        Questions:{" "}
        <a className="text-[var(--accent)] underline" href="mailto:hello@fighurai.com">
          hello@fighurai.com
        </a>
        . Support:{" "}
        <a className="text-[var(--accent)] underline" href="/support">
          fighur.ai/support
        </a>
        .
      </p>
    </LegalShell>
  );
}
