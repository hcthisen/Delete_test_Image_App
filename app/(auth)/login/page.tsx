// Login page scaffolded to hook into Supabase email/password auth as described in project docs.
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthHeader } from "../components/auth-header";

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    router.push("/dashboard");
  };

  return (
    <>
      <AuthHeader />
      <main className="auth-page">
        <div className="auth-shell">
          <section className="auth-hero">
            <span className="brand-pill">
              <span className="brand-pill__dot" aria-hidden="true" />
              Journal.Vet
          </span>
          <h1>Welcome back</h1>
          <p>
            Pick up right where you left off and keep your team aligned with voice-powered reporting,
            collaborative reviews, and beautifully formatted summaries.
          </p>
          <ul className="auth-highlights">
            <li>
              <span className="auth-highlight-icon" aria-hidden="true">
                ✓
              </span>
              Secure access to every workspace you&apos;re part of.
            </li>
            <li>
              <span className="auth-highlight-icon" aria-hidden="true">
                ✓
              </span>
              Keep case history, templates, and transcripts in one place.
            </li>
            <li>
              <span className="auth-highlight-icon" aria-hidden="true">
                ✓
              </span>
              Works beautifully across desktop and phone when you&apos;re on call.
            </li>
          </ul>
        </section>
        <form onSubmit={handleSubmit} className="auth-card" noValidate>
          <div className="auth-card__header">
            <h2>Sign in</h2>
            <p>Use the email and password from your onboarding invite.</p>
          </div>
          <div className="auth-fields">
            <label className="auth-field">
              <span className="auth-label">Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                placeholder="you@yoursurgery.com"
                autoComplete="email"
                className="auth-input"
              />
            </label>
            <label className="auth-field">
              <span className="auth-label">Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
                placeholder="Your secure password"
                autoComplete="current-password"
                className="auth-input"
              />
            </label>
          </div>
          {message ? (
            <p className="auth-message auth-message--error" role="alert">
              {message}
            </p>
          ) : null}
          <button type="submit" disabled={isSubmitting} className="btn btn-primary auth-button">
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
          <p className="auth-meta">
            Need a workspace?{" "}
            <Link href="/signup" className="auth-link">
              Create an account
            </Link>
          </p>
        </form>
      </div>
      </main>
    </>
  );
}
