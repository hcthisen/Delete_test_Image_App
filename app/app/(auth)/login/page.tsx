"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    router.push("/profile");
  };

  const handleResetPassword = async () => {
    setMessage(null);
    setIsSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/profile`,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Check your inbox for a password reset link.");
    }
    setIsSendingReset(false);
  };

  return (
    <div className="panel">
      <h1 className="page-title">Log in</h1>
      <p className="page-lead">Access your account to update your profile and explore the starter app.</p>

      <form className="form-card" onSubmit={handleSubmit}>
        <label className="field">
          <span className="label">Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label className="field">
          <span className="label">Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {message ? (
          <p className="message" role="status">
            {message}
          </p>
        ) : null}

        <div className="hero-actions">
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Log in"}
          </button>
          <button className="button secondary" type="button" onClick={handleResetPassword} disabled={!email || isSendingReset}>
            {isSendingReset ? "Sending reset…" : "Forgot password"}
          </button>
        </div>

        <p className="page-lead">
          New here? {" "}
          <Link href="/signup">Create an account</Link>.
        </p>
      </form>
    </div>
  );
}
