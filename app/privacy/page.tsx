import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Journal.Vet",
  description:
    "Understand how Journal.Vet collects, uses, and safeguards information while outlining your privacy responsibilities.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-16 text-slate-200">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-emerald-300">Privacy Policy</p>
        <h1 className="text-3xl font-semibold text-slate-100">How Journal.Vet Handles Your Data</h1>
        <p className="text-sm text-slate-400">
          This Privacy Policy explains the types of information we collect, how we use it, and the measures we take to protect
          it. By accessing or using the Service, you agree to the practices described here.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">1. Information We Collect</h2>
        <p>
          We collect information that you provide directly, such as account registration details, veterinary notes, and support
          inquiries. We also collect technical information automatically, including device characteristics, log data, and usage
          analytics to help us improve the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">2. How We Use Information</h2>
        <p>
          We use the information we collect to deliver and maintain the Service, personalize your experience, communicate
          updates, and provide customer support. Aggregated, de-identified insights may be used to improve product performance
          and reliability.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">3. Data Sharing and Disclosure</h2>
        <p>
          We do not sell your personal data. We may share information with trusted service providers who assist in operating the
          Service, subject to contractual confidentiality and security obligations. We may also disclose information to comply
          with legal obligations or to protect the rights and safety of Journal.Vet, our users, or the public.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">4. Data Security</h2>
        <p>
          We implement administrative, technical, and physical safeguards designed to protect your information. However, no
          method of transmission or storage is completely secure, and we cannot guarantee absolute security. You are responsible
          for selecting strong passwords, enabling available security features, and limiting access to your devices.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">5. Data Retention and Backups</h2>
        <p>
          We retain information for as long as necessary to fulfill the purposes described in this policy and to meet legal
          obligations. Journal.Vet does not guarantee the preservation of your data. You are solely responsible for maintaining
          independent backups of any information stored in the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">6. International Transfers</h2>
        <p>
          Your information may be processed in countries other than the one in which you reside. We implement appropriate
          safeguards to protect personal data when it is transferred internationally, consistent with applicable law.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">7. Your Choices</h2>
        <p>
          You may update your account information at any time from within the Service. You can opt out of promotional
          communications by following the instructions in those messages. Certain operational communications related to your
          account and the Service are required and cannot be opted out of while your account remains active.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">8. Children&apos;s Privacy</h2>
        <p>
          The Service is not directed to individuals under the age required to create a binding contract. We do not knowingly
          collect personal information from children. If we learn that a child has provided us with personal data, we will take
          steps to remove it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. If we make material changes, we will provide notice through the
          Service or by email. Your continued use after the changes take effect constitutes acceptance of the revised policy.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">10. Contact</h2>
        <p>
          If you have questions about this Privacy Policy or our data practices, contact us at
          {" "}
          <a className="text-emerald-300" href="mailto:hello@journal.vet">
            hello@journal.vet
          </a>{" "}
          or visit our
          {" "}
          <Link className="text-emerald-300" href="/contact">
            Contact page
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
