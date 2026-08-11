import type { Metadata } from "next";

import { LegalShell } from "@/components/legal-shell";
import { SITE_TITLE } from "@/lib/site-brand";

export const metadata: Metadata = {
  title: "Extension EULA",
  description: `End User License Agreement for the ${SITE_TITLE} Colors Chrome extension.`,
};

export default function EulaPage() {
  return (
    <LegalShell title="FIGHURAI Colors — EULA">
      <p>Last updated: August 11, 2026</p>
      <p className="text-[0.7rem] text-[var(--text-faint)]">
        This is a product license template for commercialization. Have counsel review before relying
        on it in a dispute.
      </p>
      <p>
        This End User License Agreement (“EULA”) governs your use of the {SITE_TITLE} Colors browser
        extension (the “Extension”). By installing or using the Extension, you agree to this EULA
        and our{" "}
        <a className="text-[var(--accent)] underline" href="/terms">
          Terms of Use
        </a>{" "}
        and{" "}
        <a className="text-[var(--accent)] underline" href="/privacy">
          Privacy Policy
        </a>
        .
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">1. Ownership</h2>
      <p>
        The Extension, including its code, design, trademarks, and documentation, is owned by{" "}
        {SITE_TITLE} and its licensors. This EULA does <strong>not</strong> transfer ownership to
        you. All rights not expressly granted are reserved.
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">2. License grant</h2>
      <p>
        Subject to an active eligible {SITE_TITLE} Pro subscription (or other access we expressly
        grant), we grant you a limited, personal, non-exclusive, non-transferable, revocable license
        to install and use the Extension on browsers you control, solely to apply color preferences
        as provided by the Extension.
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">3. Restrictions</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Do not sell, rent, sublicense, or redistribute the Extension or its files.</li>
        <li>Do not reverse engineer, decompile, or attempt to bypass Pro entitlement checks.</li>
        <li>Do not remove proprietary notices or claim the Extension as your product.</li>
        <li>Do not use the Extension to violate law or third-party rights.</li>
      </ul>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">4. Account & data</h2>
      <p>
        Pro status is verified through {SITE_TITLE}. The Extension is designed not to receive your
        email or name — only entitlement flags. Color settings are stored locally in your browser.
        See the Privacy Policy for details.
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">5. Fees</h2>
      <p>
        Access to the Extension’s Pro features is sold as part of {SITE_TITLE} Pro (or other plans we
        designate) via fighur.ai billing. Browser stores may have additional policies; we do not
        sell Extension licenses inside the Chrome Web Store unless we say otherwise.
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">6. Termination</h2>
      <p>
        This license ends if your Pro access ends, if you breach this EULA, or if we discontinue the
        Extension. On termination, stop using the Extension and uninstall it.
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">7. Disclaimer</h2>
      <p>
        THE EXTENSION IS PROVIDED “AS IS.” TO THE FULLEST EXTENT PERMITTED BY LAW, {SITE_TITLE}{" "}
        DISCLAIMS WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
        NON-INFRINGEMENT. SOME SITES MAY NOT RENDER CUSTOM COLORS CORRECTLY.
      </p>

      <h2 className="pt-2 text-base font-semibold text-[var(--text-primary)]">8. Contact</h2>
      <p>
        <a className="text-[var(--accent)] underline" href="mailto:hello@fighurai.com">
          hello@fighurai.com
        </a>{" "}
        ·{" "}
        <a className="text-[var(--accent)] underline" href="/legal">
          Ownership &amp; launch checklist
        </a>
      </p>
    </LegalShell>
  );
}
