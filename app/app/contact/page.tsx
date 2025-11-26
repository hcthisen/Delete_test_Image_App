import type { FormEvent } from "react";

export const metadata = {
  title: "Contact",
  description: "Reach out to the team behind this Supabase starter.",
};

export default function ContactPage() {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // TODO: Connect this form to your preferred email provider or API route.
    console.log("Contact form submitted", Object.fromEntries(formData.entries()));
    event.currentTarget.reset();
    alert("Thanks for reaching out! Replace this alert with your own handler.");
  };

  return (
    <div className="panel">
      <h1 className="page-title">Contact</h1>
      <p className="page-lead">Have questions about adapting this template? Drop a note below.</p>

      <form className="form-card" onSubmit={handleSubmit}>
        <label className="field">
          <span className="label">Name</span>
          <input className="input" name="name" type="text" required placeholder="Your name" />
        </label>

        <label className="field">
          <span className="label">Email</span>
          <input className="input" name="email" type="email" required placeholder="you@example.com" />
        </label>

        <label className="field">
          <span className="label">Message</span>
          <textarea className="textarea" name="message" required placeholder="How can we help?" />
        </label>

        <button className="button" type="submit">
          Send message
        </button>
      </form>
    </div>
    );
  }
