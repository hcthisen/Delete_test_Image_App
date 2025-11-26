export const metadata = {
  title: "Privacy & Cookies",
  description: "Explain how your template app handles data and cookies.",
};

export default function PrivacyPage() {
  return (
    <div className="panel">
      <h1 className="page-title">Privacy & Cookies</h1>
      <p className="page-lead">
        Use this page to outline how you collect, store, and protect user data. Replace the placeholders with policies tailored
        to your product and region.
      </p>

      <section className="space-y-2">
        <h2>Data collection</h2>
        <p>
          Explain what personal data you collect (e.g., email, profile details) and why. Mention analytics or logging if
          applicable.
        </p>
        <p className="page-lead">
          <strong>TODO:</strong> Document any third-party services that receive data.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Cookies</h2>
        <p>
          Describe the cookies or local storage used for authentication and preferences. Let users know how they can manage or
          opt out of non-essential cookies.
        </p>
        <p className="page-lead">
          <strong>TODO:</strong> Add your cookie categories and retention periods.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Data rights</h2>
        <p>Share how users can request access, updates, or deletion of their data stored in your Supabase project.</p>
        <p className="page-lead">
          <strong>TODO:</strong> Provide contact details or an automated workflow for data requests.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Security</h2>
        <p>Summarize the security controls you use (e.g., row level security, SSL, access controls) and user responsibilities.</p>
        <p className="page-lead">
          <strong>TODO:</strong> Include any incident response steps and backup policies.
        </p>
      </section>
    </div>
  );
}
