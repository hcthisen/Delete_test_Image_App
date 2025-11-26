// Signup page scaffolded to kick off Supabase onboarding and workspace provisioning described in planning docs.
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthHeader } from "../components/auth-header";

export default function SignupPage() {
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setMessageTone("error");

    if (password !== confirmPassword) {
      setMessage("Passwords must match before continuing.");
      return;
    }

    setIsSubmitting(true);

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setMessageTone("error");
      setMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      router.push("/dashboard");
      return;
    }

    setMessageTone("success");
    setMessage("Success! Check your inbox to confirm your email and finish setting up your workspace.");
    setIsSubmitting(false);
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
          <h1>Create your workspace</h1>
          <p>
            Launch a secure workspace tailored for your practice, complete with templates, collaboration,
            and the fastest way to move from dictation to finished report.
          </p>
          <ul className="auth-highlights">
            <li>
              <span className="auth-highlight-icon" aria-hidden="true">
                ✓
              </span>
              Provision core members and manage permissions in minutes.
            </li>
            <li>
              <span className="auth-highlight-icon" aria-hidden="true">
                ✓
              </span>
              Build on proven clinical templates, or bring your own.
            </li>
            <li>
              <span className="auth-highlight-icon" aria-hidden="true">
                ✓
              </span>
              Automatically sync voice notes to structured SOAP summaries.
            </li>
          </ul>
        </section>
        <form onSubmit={handleSubmit} className="auth-card" noValidate>
          <div className="auth-card__header">
            <h2>Create an account</h2>
            <p>We&apos;ll set up your profile and first workspace in just a moment.</p>
          </div>
          <div className="auth-fields">
            <label className="auth-field">
              <span className="auth-label">Work email</span>
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
                placeholder="Create a secure password"
                autoComplete="new-password"
                className="auth-input"
              />
            </label>
            <label className="auth-field">
              <span className="auth-label">Confirm password</span>
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                required
                placeholder="Repeat your password"
                autoComplete="new-password"
                className="auth-input"
              />
            </label>
          </div>
          {message ? (
            <p
              className={`auth-message ${
                messageTone === "success" ? "auth-message--success" : "auth-message--error"
              }`}
              role={messageTone === "success" ? "status" : "alert"}
            >
              {message}
            </p>
          ) : null}
          <button type="submit" disabled={isSubmitting} className="btn btn-primary auth-button">
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
          <p className="auth-meta">
            Already have an account?{" "}
            <Link href="/login" className="auth-link">
              Return to login
            </Link>
          </p>
        </form>
      </div>
      </main>
    </>
  );
}
