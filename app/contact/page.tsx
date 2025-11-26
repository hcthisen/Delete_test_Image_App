export const metadata = {
  title: "Contact | Journal.Vet",
  description: "Get in touch with the Journal.Vet team for questions, feedback, or support.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-16 text-slate-200">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-emerald-300">Contact</p>
        <h1 className="text-3xl font-semibold text-slate-100">We&apos;re here to help</h1>
        <p className="text-sm text-slate-400">
          Reach out with product questions, feedback, or partnership ideas. We typically respond within two business days.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Email</h2>
          <p className="text-sm text-slate-400">Send us a message at</p>
          <a className="text-base font-medium text-emerald-300" href="mailto:hello@journal.vet">
            hello@journal.vet
          </a>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Phone</h2>
          <p className="text-sm text-slate-400">Call us during standard business hours (UTC+1)</p>
          <a className="text-base font-medium text-emerald-300" href="tel:+4553833690">
            +45 53 83 36 90
          </a>
        </div>
      </section>

      <section className="space-y-3 text-sm text-slate-400">
        <p>
          Journal.Vet support is available Monday through Friday, excluding public holidays. For sensitive or regulated data,
          please avoid sharing patient-identifying information in unencrypted channels.
        </p>
        <p>
          The Service is not intended for emergency communication. If you require urgent assistance, contact the appropriate
          local authorities or emergency services.
        </p>
        <p>
          Remember to maintain your own secure backups of any information stored in Journal.Vet. We cannot be held responsible
          for lost or corrupted data transmitted through the Service or via support interactions.
        </p>
      </section>
    </main>
  );
}
