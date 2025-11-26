import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="hero">
        <div>
          <p className="page-lead">Supabase-powered starter template</p>
          <h1 className="page-title">Your App Name</h1>
          <p className="page-lead">
            Kickstart your product with pre-built authentication, profile management, and essential legal pages. Replace the
            copy, plug in your Supabase keys, and ship faster.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/signup">
              Get started
            </Link>
            <Link className="button secondary" href="/login">
              Already registered? Log in
            </Link>
          </div>
        </div>
        <div className="panel">
          <h2>What&apos;s included</h2>
          <ul className="list">
            <li>Email/password authentication with Supabase.</li>
            <li>Protected profile area with editable fields.</li>
            <li>Contact, Terms, and Privacy pages with placeholder copy.</li>
            <li>Clean layout ready for your brand and styling.</li>
          </ul>
        </div>
      </section>

      <section className="grid-two">
        <div className="panel">
          <h2>Ready to customize</h2>
          <p className="page-lead">
            Swap the placeholder content with your messaging, connect a real contact handler, and extend the profile with the
            fields that matter to your team.
          </p>
        </div>
        <div className="panel">
          <h2>Supabase friendly</h2>
          <p className="page-lead">
            All auth flows and profile persistence run through Supabase. Add policies or tables in `supabase/migrations` to grow
            alongside your product.
          </p>
        </div>
      </section>
    </div>
  );
}
