"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { establishServerSession } from "@/lib/auth-storage";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-10 sm:py-14">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
        Create account
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
        The server creates a private folder for your user id and sets a sealed httpOnly session cookie.
        Add real password checks and email verification when you move to production auth.
      </p>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setFormError(null);
          const trimmed = email.trim();
          if (!trimmed.includes("@")) return;
          setBusy(true);
          try {
            const ok = await establishServerSession({
              email: trimmed,
              name: name.trim() || undefined,
            });
            if (!ok) {
              setFormError(
                "Could not create your account on the server. Check SMILE_APP_SECRET or SMILE_OAUTH_COOKIE_SECRET (16+ characters).",
              );
              return;
            }
            router.push("/");
          } finally {
            setBusy(false);
          }
        }}
      >
        {formError ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{formError}</p>
        ) : null}
        <label className="block text-xs font-medium text-[var(--text-muted)]">
          Name (optional)
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/40"
          />
        </label>
        <label className="block text-xs font-medium text-[var(--text-muted)]">
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/40"
          />
        </label>
        <label className="block text-xs font-medium text-[var(--text-muted)]">
          Password
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/40"
            placeholder="Optional for demo"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-foreground)] shadow-[0_0_24px_var(--accent-glow)] transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-[var(--text-faint)]">
        Already have one?{" "}
        <Link href="/sign-in" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
          Sign in
        </Link>{" "}
        ·{" "}
        <Link href="/" className="text-[var(--text-muted)] underline-offset-2 hover:underline">
          Back to chat
        </Link>
      </p>
    </div>
  );
}
