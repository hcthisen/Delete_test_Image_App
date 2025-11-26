# Journal.Vet

Journal.Vet is a minimalistic yet premium web app for veterinarians to record, transcribe, and summarise clinical notes. The product is optimised for desktop and mobile browsers, delivers an ultra-simple voice capture flow, and leans on Supabase for authentication, storage, and background processing.

## ✨ Core Capabilities
- **One-tap recording & uploads** – Start → Recording screen (single Stop button) → Save/Delete with confirmation, or upload an existing audio file.
- **Automatic transcription & summaries** – Saved audio triggers Supabase Edge Functions that run ASR, apply vocabulary corrections, and generate structured summaries with LLM templates.
- **Template library** – Standard templates (Bulleted Points, Clean Transcript, Email, Post-Operative Report, Client Callback, Physical Exam, SOAP Ezyvet, SOAP Framework) plus workspace-specific customs.
- **Workspace collaboration** – Every account spins up a workspace where the creator is the Core member. Core users manage invitations and shared assets; Sub users capture journals and craft their own templates.
- **Vocabulary corrections** – Workspace dictionary patches frequently mis-transcribed medical terms before summarisation.
- **Profile defaults** – Each user stores a preferred language and template to remove friction when saving new journals.

## 🧱 Architecture Snapshot
- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS, MediaRecorder API for audio capture.
- **Backend**: Supabase Auth, Postgres with RLS, Storage buckets for audio/exports, Edge Functions orchestrating transcription & summarisation.
- **Integrations**: Configurable ASR provider (e.g., Deepgram, AssemblyAI) and LLM provider (OpenAI/Anthropic). Optional email service for invite delivery.
- **Hosting**: Vercel for the web client, Supabase for data/services. CI/CD via GitHub Actions.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed walkthrough of the system.

## 🗂️ Workspace & Permissions Model
| Role | Capabilities |
|------|--------------|
| **Core account** | Full control of workspace configuration, templates, vocabulary, and members. Can delete any journal or template in the workspace. |
| **Sub account** | Create journals, manage their own templates, contribute vocabulary entries. Cannot delete or edit Core-owned templates or manage members. |

Journals, templates, and vocabulary entries are shared across the workspace, giving teams a single source of truth.

## 📚 Documentation
- [Planning](./PLANNING.md) – Roadmap, milestones, and success metrics.
- [Architecture](./ARCHITECTURE.md) – System design, flows, and integrations.
- [Schema](./SCHEMA.md) – Supabase/Postgres tables, relations, and RLS guidance.

## 🚧 Status & Getting Started
The product is in active design and early development. Full setup instructions will land once the Next.js codebase is published. Planned steps:

```bash
# Clone the repository
git clone https://github.com/hcthisen/Journal.vet.git
cd Journal.vet

# Install dependencies (coming soon)
npm install

# Configure Supabase + environment
cp .env.example .env.local

# Run development server (coming soon)
npm run dev
```

Prerequisites will include Node.js 18+, npm (or pnpm), and a Supabase project configured with the schema defined in `SCHEMA.md`.

### Environment variables

Supabase access is configured through the following variables:

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | The Supabase project URL (e.g. `https://your-project.supabase.co`). |
| `SUPABASE_ANON` | The Supabase anon key associated with the project. |

At build time these values are automatically exposed to the browser as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, enabling the client-side Supabase SDK to sign users in. Populate the variables in `.env.local` (or the hosting provider's environment settings) before running the app.

## 🛠️ Recent scaffolding updates
- Added initial Next.js App Router directories for Supabase auth pages (login, signup, dashboard placeholder).
- Introduced a reusable Supabase browser client factory for shared authentication state.
- Seeded the Supabase migrations folder with the schema outlined in SCHEMA.md for first project setup.

## 🔐 Security & Compliance
- Supabase Auth with RLS-enforced data separation per workspace.
- Private storage buckets for audio and exports with signed URL access.
- Environment-scoped API keys for ASR/LLM providers.
- Audit-friendly metadata on journals and invites for traceability.

## 🧭 Roadmap Highlights
- MVP delivery in ~10 weeks (see Planning doc for breakdown).
- Initial user goals: 100 active veterinarians, 25 workspaces, ≤10 minute transcription-to-summary SLA.
- Future ideas: EHR integrations, richer analytics, offline capture queue.

## 🤝 Contributing
The repository is private during initial build-out. Contribution guidelines and issue templates will be published alongside the first public release.

## 📄 License
All rights reserved. Journal.Vet is proprietary software.
