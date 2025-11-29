import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="hero">
        <div>
          <p className="page-lead">Forge deep digital humans</p>
          <h1 className="page-title">Human Forge</h1>
          <p className="page-lead">
            Craft lifelike avatars with layered traits, narratives, and visuals. Human Forge helps you design research-ready
            personas powered by Supabase auth, storage, and automation.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/signup">
              Start forging
            </Link>
            <Link className="button secondary" href="/login">
              Already registered? Log in
            </Link>
          </div>
        </div>
        <div className="panel">
          <h2>What you can build</h2>
          <ul className="list">
            <li>Manage multiple avatars tied to your Supabase users.</li>
            <li>Send rich profile data to n8n for persona text and imagery.</li>
            <li>Store generated images privately in Supabase Storage.</li>
            <li>Review narrative profiles and scenario galleries at a glance.</li>
          </ul>
        </div>
      </section>

      <section className="grid-two">
        <div className="panel">
          <h2>Designed for insight teams</h2>
          <p className="page-lead">
            Capture demographics, mindset, and quirks in one flow. Human Forge keeps details structured so your generators and
            research tools stay in sync.
          </p>
        </div>
        <div className="panel">
          <h2>Supabase-native</h2>
          <p className="page-lead">
            Auth, RLS, and Storage keep each user&apos;s humans separate and secure. Extend the schema or policies as you scale your
            avatar lab.
          </p>
        </div>
      </section>
    </div>
  );
}
