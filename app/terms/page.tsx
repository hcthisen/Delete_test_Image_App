import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Journal.Vet",
  description:
    "Review the Journal.Vet Terms of Service outlining acceptable use, responsibilities, and limitations of liability.",
};

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-16 text-slate-200">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-emerald-300">Terms of Service</p>
        <h1 className="text-3xl font-semibold text-slate-100">Journal.Vet Customer Agreement</h1>
        <p className="text-sm text-slate-400">
          These Terms of Service (the "Terms") govern your access to and use of the Journal.Vet platform, including any
          related mobile or web applications, content, and services (collectively, the "Service"). By accessing or using the
          Service you agree to be bound by these Terms.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">1. Eligibility and Account Responsibilities</h2>
        <p>
          You must be capable of forming a binding contract and comply with all applicable laws to use the Service. You are
          responsible for maintaining the confidentiality of your account credentials, and you agree to notify us immediately
          of any unauthorized use. Journal.Vet is not liable for any loss or damage resulting from your failure to secure your
          account.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">2. Use of the Service</h2>
        <p>
          The Service is provided to support the organization and management of veterinary journaling workflows. You agree not
          to misuse the Service, interfere with its normal operation, or access it using a method other than the interfaces and
          instructions we provide. We may monitor use to ensure compliance with these Terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">3. Content and Data Ownership</h2>
        <p>
          You retain all ownership rights to the information you submit to the Service. By submitting content, you grant
          Journal.Vet a non-exclusive, worldwide, royalty-free license to host, store, and process that content solely for the
          purpose of operating and improving the Service.
        </p>
        <p>
          You are solely responsible for the accuracy, legality, and integrity of the content you upload. You represent that you
          have all necessary rights and permissions to store and process any data within the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">4. Data Retention and Backups</h2>
        <p>
          Journal.Vet provides the Service on an "as is" and "as available" basis without any warranty that data will be stored
          without loss. You are solely responsible for maintaining independent copies and backups of any information you add to
          the Service. We are not liable for any data loss or corruption, regardless of the cause.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">5. Compliance and Professional Responsibility</h2>
        <p>
          The Service is not a substitute for professional judgment or regulatory compliance. You are responsible for ensuring
          that your use of the Service complies with all applicable privacy, medical-record, and professional regulations. Any
          guidance or templates provided are for convenience only and do not constitute legal or medical advice.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">6. Payment and Subscription Terms</h2>
        <p>
          If you purchase a paid plan, you authorize us to charge the applicable fees using the payment method you provide. Fees
          are non-refundable except where required by law. We may change pricing by providing advance notice to the email
          associated with your account.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">7. Termination</h2>
        <p>
          We may suspend or terminate your access to the Service at any time for conduct that violates these Terms or that we
          reasonably believe is harmful to the Service or other users. You may discontinue use at any time. Upon termination, you
          remain responsible for any outstanding fees and for exporting your data.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">8. Disclaimers and Limitation of Liability</h2>
        <p>
          The Service is provided without warranties of any kind, whether express or implied, including implied warranties of
          merchantability, fitness for a particular purpose, or non-infringement. To the fullest extent permitted by law,
          Journal.Vet and its affiliates will not be liable for any indirect, incidental, special, consequential, or exemplary
          damages, or for any loss of profits, revenues, data, goodwill, or other intangible losses resulting from your use of
          the Service.
        </p>
        <p>
          Our total liability for any claim arising out of or relating to the Service is limited to the amount you paid, if any,
          for use of the Service during the twelve (12) months prior to the event giving rise to the claim.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">9. Modifications</h2>
        <p>
          We may modify these Terms at any time. If changes are material, we will provide notice by email or through the Service.
          Continued use after the effective date of the updated Terms constitutes acceptance of the changes.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">10. Governing Law and Dispute Resolution</h2>
        <p>
          These Terms are governed by the laws of the jurisdiction in which Journal.Vet is organized, without regard to conflict
          of law principles. Any dispute arising from these Terms or the Service will be resolved through binding arbitration or
          in the courts of competent jurisdiction, unless a different forum is required by applicable law.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">11. Contact</h2>
        <p>
          Questions about these Terms can be directed to
          {" "}
          <a className="text-emerald-300" href="mailto:hello@journal.vet">
            hello@journal.vet
          </a>{" "}
          or by visiting our
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
