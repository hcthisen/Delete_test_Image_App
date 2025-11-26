export const metadata = {
  title: "Terms of Service",
  description: "Template Terms of Service for your Supabase-powered app.",
};

export default function TermsPage() {
  return (
    <div className="panel">
      <h1 className="page-title">Terms of Service</h1>
      <p className="page-lead">
        This is placeholder legal text. Replace it with terms that reflect your product, jurisdiction, and business policies.
      </p>

      <section className="space-y-2">
        <h2>1. Using the Service</h2>
        <p>
          Describe what your app does, who it is for, and any eligibility requirements. Outline acceptable use guidelines and
          prohibited activities.
        </p>
        <p className="page-lead">
          <strong>TODO:</strong> Add your own acceptable use policy and jurisdiction-specific requirements.
        </p>
      </section>

      <section className="space-y-2">
        <h2>2. Accounts</h2>
        <p>Explain how accounts are created, responsibilities for safeguarding credentials, and when accounts may be terminated.</p>
        <p className="page-lead">
          <strong>TODO:</strong> Insert your account termination and dispute resolution process.
        </p>
      </section>

      <section className="space-y-2">
        <h2>3. Data</h2>
        <p>
          Summarize how you handle user-generated content and what rights users grant you to operate the service. Reference your
          Privacy Policy for full details.
        </p>
        <p className="page-lead">
          <strong>TODO:</strong> Clarify ownership, licensing, and retention policies for data stored in your app.
        </p>
      </section>

      <section className="space-y-2">
        <h2>4. Liability</h2>
        <p>Include disclaimers, limitations of liability, and any warranty statements relevant to your service.</p>
        <p className="page-lead">
          <strong>TODO:</strong> Work with legal counsel to tailor these limits to your business.
        </p>
      </section>

      <section className="space-y-2">
        <h2>5. Contact</h2>
        <p>Provide a way for users to reach you with questions about these terms.</p>
        <p className="page-lead">
          <strong>TODO:</strong> Add your company&apos;s legal contact details.
        </p>
      </section>
    </div>
  );
}
