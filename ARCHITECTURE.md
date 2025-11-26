# Journal.Vet – Technical Architecture

## 1. System Overview
Journal.Vet is a browser-first application that combines a lightweight React/Next.js client with Supabase-backed services. The goal is to give veterinarians a frictionless way to capture audio, turn it into structured clinical notes, and collaborate inside shared workspaces. The architecture emphasises a minimal surface area (no bespoke servers) while still supporting secure multi-tenant data separation, audio processing jobs, and AI-powered summarisation.

### High-level topology
```
┌──────────────────────────────┐
│          Web Client          │
│  • Next.js (React + TS)      │
│  • Tailwind UI               │
│  • MediaRecorder API         │
│  • Zustand/React Query state │
└──────────────┬───────────────┘
               │ GraphQL/REST
               ▼
┌──────────────────────────────┐
│          Supabase            │
│  • Auth (magic links, SSO)   │
│  • Postgres + RLS            │
│  • Storage (audio, exports)  │
│  • Edge Functions            │
└──────────────┬───────────────┘
               │ Webhooks / Jobs
               ▼
┌──────────────────────────────┐
│  External AI Providers       │
│  • Speech-to-text (ASR)      │
│  • LLM summarisation         │
└──────────────────────────────┘
```

The browser handles capture and upload, Supabase coordinates persistence and background processing, and external AI services deliver transcription and summarisation. Row Level Security (RLS) keeps every workspace isolated.

## 2. Client Architecture

### Application shell
- **Framework**: Next.js 14 with the App Router for hybrid SSR/SPA rendering.
- **Styling**: Tailwind CSS + Headless UI for a premium but focused look.
- **State**: React Query for server cache + Zustand (or Context) for UI state (recording session, template selection, modals).
- **Routing**: Public marketing pages, authenticated workspace shell, and nested routes for Journals, Templates, Vocabulary, and Team settings.

### Audio capture flow
1. Detect microphone availability and request permission.
2. Use the browser MediaRecorder API to stream audio to memory.
3. Present a full-screen "Recording" mode with a single Stop button.
4. On stop, allow Save (with template & language pickers) or Delete (with confirm modal).
5. When the user saves, push audio to Supabase Storage via signed uploads and create a draft `journal` row.

### Offline & responsiveness
- Optimise for mobile Safari/Chrome with progressive enhancement (larger touch targets, safe-area spacing).
- Persist in-progress recordings in memory only (no local storage) to maintain privacy.
- Lazy load transcription status via Supabase real-time channels or polling.

## 3. Supabase backend

### Postgres schema (summary)
- `profiles` – mirrors `auth.users`, stores default language & template.
- `workspaces` & `workspace_members` – multi-tenant boundary with `core` and `sub` roles.
- `templates` – seeded standard templates (`Std`) plus workspace-specific customs.
- `journals` – captures audio metadata, transcript, summary, and processing status.
- `vocabulary_entries` – workspace-specific term corrections.
- `invites` – tracks pending workspace invitations.
- `languages` – optional helper lookup.

See [SCHEMA.md](./SCHEMA.md) for detailed DDL.

### Row Level Security & permissions
- Enable RLS on all tables.
- Policies enforce that users only interact with workspaces where they are members.
- Role-specific policies (core status is computed by `workspace_id = auth.uid()`):
  - **Core accounts**: full read/write/delete within their workspace, manage members, manage templates, delete journals.
  - **Sub accounts**: can create journals, vocabulary, and custom templates they own; cannot delete Core-created templates or remove members.
- Auth guard rails in the client ensure profile defaults reference selectable templates only.

### Edge Functions & background jobs
- **handle_new_user**: triggered after Auth signup; creates the profile, provisions the workspace keyed by the user ID, and inserts the guaranteed self-membership.
- **accept_invite**: validates invite tokens, inserts the membership row, and marks the invite accepted.
- **decline_invite**: lets invitees mark pending invites as declined without workspace access.
- **get_pending_invites_for_user**: security-definer helper that lists active invites for the signed-in user.
- **process_journal** pipeline:
  1. Triggered by `journal` insert or storage webhook.
  2. Calls ASR provider, stores transcript.
  3. Applies vocabulary replacements (workspace dictionary).
  4. Calls LLM with selected template to produce `summary`.
  5. Updates `status` (`processed` or `error`) and timestamps.
- Use Supabase Queues or scheduled Edge Functions for retries and maintenance (e.g., expiring invites).

## 4. Storage & asset handling
- **audio bucket** (private): `{workspace_id}/{journal_id}/{timestamp}.webm` or original format.
- **exports bucket** (private): generated PDFs/emails for download.
- Signed URLs provide time-limited access for playback and download.

## 5. Integrations
- **Speech-to-text**: configurable provider (Deepgram, AssemblyAI, Google). Abstracted via Edge Function for swapability.
- **LLM summarisation**: OpenAI, Anthropic, or Azure OpenAI. Templates provide prompt scaffolding; workspace dictionary appended for context.
- **Email** (optional): transactional service (Resend/SendGrid) for invite delivery.

## 6. Operational concerns
- **Logging & monitoring**: Supabase logs + client-side Sentry for error tracking.
- **Config management**: Environment variables for API keys (ASR/LLM), stored in Supabase project settings or Vercel.
- **Deployment**: Vercel for the Next.js frontend; Supabase hosts Postgres, Auth, Edge Functions, and Storage.
- **CI/CD**: GitHub Actions running lint/tests, deploying preview builds, and applying Supabase migrations.

## 7. Future enhancements
- Batch export of journals to EHR systems (ezyVet, Shepherd) via API integrations.
- Expanded analytics dashboards (usage, turnaround time).
- Local processing fallback for offline clinics (store-and-forward queue).
- Fine-grained template permissions (per-member ownership or locking).
