"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { signInWithPassword } from "@/lib/auth-storage";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-10 sm:py-14">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
        Sign in
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
        Secure account with password hashing, RBAC, audit logs, and a private data environment per user.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        <a
          href="/api/auth/sso/google"
          className="flex w-full items-center justify-center rounded-xl border border-white/[0.14] bg-white/[0.04] py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-white/[0.08]"
        >
          Continue with Google
        </a>
        <a
          href="/api/auth/sso/microsoft"
          className="flex w-full items-center justify-center rounded-xl border border-white/[0.14] bg-white/[0.04] py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-white/[0.08]"
        >
          Continue with Microsoft
        </a>
      </div>

      <p className="my-4 text-center text-xs text-[var(--text-faint)]">or sign in with email</p>

      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setFormError(null);
          const trimmed = email.trim();
          if (!trimmed.includes("@") || password.length < 8) {
            setFormError("Enter a valid email and password (8+ characters).");
            return;
          }
          setBusy(true);
          try {
            const result = await signInWithPassword({ email: trimmed, password });
            if (!result.ok) {
              setFormError(result.error || "Sign in failed.");
              return;
            }
            router.push("/");
          } finally {
            setBusy(false);
          }
        }}
      >
        {formError ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {formError}
          </p>
        ) : null}
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
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/40"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-foreground)] shadow-[0_0_24px_var(--accent-glow)] transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-[var(--text-faint)]">
        No account?{" "}
        <Link href="/sign-up" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
          Create one
        </Link>{" "}
        ·{" "}
        <Link href="/" className="text-[var(--text-muted)] underline-offset-2 hover:underline">
          Back to chat
        </Link>
      </p>
    </div>
  );
}
