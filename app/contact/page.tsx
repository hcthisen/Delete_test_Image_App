"use client";

import { useMemo, useState, type FormEvent } from "react";

import { logger } from "@/lib/logger";
import { getRequestId } from "@/lib/request-id";

type FieldDescriptor = {
  name: string;
  label: string;
  placeholder: string;
  type?: string;
  as?: "input" | "textarea";
};

export default function ContactPage() {
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const requestId = useMemo(() => getRequestId(), []);

  const fields = useMemo<FieldDescriptor[]>(
    () => [
      { name: "name", label: "Name", placeholder: "Your name", type: "text" },
      { name: "email", label: "Email", placeholder: "you@example.com", type: "email" },
      { name: "message", label: "Message", placeholder: "How can we help?", as: "textarea" },
    ],
    []
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmissionStatus(null);
    const formData = new FormData(event.currentTarget);

    logger.info({
      scope: "http.contact.submit",
      msg: "Contact form submitted (placeholder handler)",
      requestId,
      payloadSummary: {
        providedFields: Array.from(formData.keys()),
        messageLength: String(formData.get("message") ?? "").length,
      },
    });
    event.currentTarget.reset();
    setSubmissionStatus("Thanks for reaching out! Replace this handler with your own integration.");
  };

  return (
    <div className="panel">
      <h1 className="page-title">Contact</h1>
      <p className="page-lead">Have questions about adapting this template? Drop a note below.</p>

      <form className="form-card" onSubmit={handleSubmit}>
        {fields.map((field) => {
          const isTextArea = field.as === "textarea";
          return (
            <label key={field.name} className="field">
              <span className="label">{field.label}</span>
              {isTextArea ? (
                <textarea
                  className="textarea"
                  name={field.name}
                  required
                  placeholder={field.placeholder}
                  rows={4}
                />
              ) : (
                <input
                  className="input"
                  name={field.name}
                  type={field.type}
                  required
                  placeholder={field.placeholder}
                />
              )}
            </label>
          );
        })}

        {submissionStatus ? <p className="message">{submissionStatus}</p> : null}

        <button className="button" type="submit">
          Send message
        </button>
      </form>
    </div>
  );
}
