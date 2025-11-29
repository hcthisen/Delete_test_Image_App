# Supabase Next.js Starter Template

A minimal, reusable Next.js App Router template wired to Supabase authentication and a simple profile table. It includes common
pages (home, auth, profile, terms, privacy, contact) with placeholder copy so you can focus on customizing the experience for
your product.

## Tech stack
- Next.js (App Router) + React + TypeScript
- Supabase for authentication and Postgres storage
- Vanilla CSS for the default layout

## Getting started
1. Clone the repository, install dependencies, and start the dev server:
   ```bash
   npm install
   npm run dev
   ```
2. Create a Supabase project and copy your project URL and anon key.
3. Duplicate `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - If you are connecting n8n automations, also add `NEXT_PUBLIC_N8N_AVATAR_WEBHOOK_URL` and `NEXT_PUBLIC_N8N_SCENES_WEBHOOK_URL`
     with the full HTTPS URLs for your webhook endpoints.
4. Apply the initial migration to create the `profiles` table:
   ```bash
   supabase db push --project-ref <your-project-ref>
   ```
   or run the SQL in `supabase/migrations/0001_init_profiles.sql` directly in the Supabase SQL editor.
5. Start the development server:
   ```bash
   npm run dev
   ```
6. Sign up from the UI, then visit `/profile` to view and edit your saved details.

## Customization ideas
- Replace the placeholder brand name and copy with your own messaging.
- Connect the contact form to your preferred email service or API route.
- Extend the `profiles` table and update the profile form to collect additional fields.

## Notes
- Environment variables should live in `.env.local` for local development and be configured in your hosting provider for
  production deployments.
- The included Dockerfile uses Next.js standalone output for small production images.
