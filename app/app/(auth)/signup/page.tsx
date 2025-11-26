"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage("Passwords must match.");
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      router.push("/profile");
      return;
    }

    setMessage("Success! Check your inbox to confirm your email.");
    setIsSubmitting(false);
  };

  return (
    <div className="panel">
      <h1 className="page-title">Create an account</h1>
      <p className="page-lead">Sign up to access the protected profile area and start customizing this template.</p>

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
            autoComplete="new-password"
            required
          />
        </label>

        <label className="field">
          <span className="label">Confirm password</span>
          <input
            className="input"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
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
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
          <Link className="button secondary" href="/login">
            Already registered? Log in
          </Link>
        </div>
      </form>
    </div>
  );
}
