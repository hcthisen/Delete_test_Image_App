# Journal.Vet – Project Planning

## Vision
Deliver a premium-but-minimal workflow for veterinarians to capture voice notes, transform them into structured clinical records, and collaborate securely with their teams. The experience should feel effortless on desktop and mobile browsers, with intelligent defaults that respect how vets actually work.

## Strategic Objectives
1. **Frictionless capture** – One-tap recording and fast uploads so clinicians can document in between appointments.
2. **Trustworthy summaries** – Accurate transcription backed by custom vocabularies and promptable templates.
3. **Shared workspaces** – Core accounts run the workspace, invite colleagues, and keep content consistent.
4. **Operational efficiency** – No servers to babysit; Supabase handles auth, data, and background processing.

## MVP Scope
- Account creation and onboarding that automatically provisions a workspace with the creator as the Core member.
- Profile settings for default language and preferred template.
- Workspace membership management (Core invites Sub accounts via email tokens).
- Audio recording & upload UI with the "Start → Recording → Stop → Save/Delete" flow.
- Journal processing pipeline: draft creation, storage upload, transcription, vocabulary cleanup, and template-based summarisation.
- Template library (Std templates available to everyone + workspace customs with edit/delete permissions based on role).
- Vocabulary dictionary per workspace to patch recurring transcription issues.
- Journal list and detail views with status indicators (`draft`, `processed`, `error`).

## Technology Alignment
| Layer            | Decision                                                    | Notes |
|------------------|--------------------------------------------------------------|-------|
| Client           | Next.js (App Router) + React + TypeScript + Tailwind        | Optimised for PWA-like experience; leverages built-in API routes when needed. |
| State/Data       | React Query + lightweight store (Zustand/Context)           | Sync Supabase data, manage recording state. |
| Backend-as-a-Service | Supabase (Auth, Postgres, Storage, Edge Functions)      | RLS-backed multi-tenant model; background jobs for transcription. |
| AI Providers     | Configurable ASR (Deepgram/AssemblyAI) + LLM (OpenAI/Anthropic) | Abstracted via Supabase Edge Functions. |
| Delivery         | Vercel + Supabase hosting                                   | CI/CD with GitHub Actions. |

## Roadmap & Milestones
### Phase 0 – Discovery & Setup (Week 0)
- Finalise schema (see `SCHEMA.md`) and RLS policy design.
- Configure Supabase project, storage buckets, and environment secrets.
- Scaffold Next.js repo, establish shared UI primitives, and set up CI lint/test pipelines.

### Phase 1 – Accounts & Workspaces (Weeks 1-2)
- Implement Supabase Auth (email magic link to start).
- On signup, run automation to create `profiles`, provision the default workspace with `id = auth.uid()`, and insert the guaranteed self-membership row.
- Build workspace switcher (future-proofing) and profile settings for language/template defaults.

### Phase 2 – Recording & Journals (Weeks 3-4)
- Build recording/upload UI with the simplified flow and responsive layout.
- Save audio to Storage, create draft journals, and surface processing status in the dashboard.
- Implement journal list & detail views with filtering by template/status.

### Phase 3 – Processing Pipeline (Weeks 5-6)
- Implement Edge Function to process journals: ASR → vocabulary replacement → LLM summary.
- Seed Std templates (Bulleted Points, Clean Transcript, Email, Post-Operative Report, Client Callback, Physical Exam, SOAP Ezyvet, SOAP Framework).
- Allow users to create custom templates tied to their workspace.

### Phase 4 – Collaboration & Enhancements (Weeks 7-8)
- Workspace invites with token acceptance flow; manage member roles (Core vs Sub).
- Vocabulary management UI (CRUD with per-role permissions).
- Error handling & retry strategy for failed transcriptions/summaries.

### Phase 5 – Polish & Launch Prep (Weeks 9-10)
- Usability polish, responsive QA, and accessibility pass on core flows.
- Analytics & logging hooks (Sentry, Supabase logs).
- Security review (RLS policies, storage access patterns, least-privilege API keys).
- Prepare marketing copy, onboarding tips, and support documentation.

## Success Metrics
- **Adoption**: 100 active veterinarians and 25 workspaces within the first quarter.
- **Engagement**: ≥5 journals per active user per week with <10 minute turnaround from recording to summary.
- **Accuracy**: 95%+ of processed journals require no manual transcription edits after applying vocabulary corrections.
- **Satisfaction**: 4.5/5 user feedback on the recording and summarisation flow.

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| ASR inaccuracies with medical terminology | Curate vocabulary dictionary feature, allow quick reprocess with updated terms, evaluate providers using real veterinary samples. |
| Role confusion between Core and Sub accounts | Provide in-app role badges, clear permission copy in UI, and guard destructive actions with confirmation. |
| Long-running transcription jobs | Queue jobs via Edge Functions, surface status + retry option, and add timeout alerts. |
| Mobile browser limitations for audio APIs | Implement capability detection, document supported browsers, and test on iOS/Android flagship devices. |

## Immediate Next Steps
1. Translate Supabase schema into migrations with triggers/functions.
2. Implement the `handle_new_user` signup trigger and invitation acceptance RPCs.
3. Design the recording UI flow in Figma to validate the minimal interaction model.
4. Define prompt templates for each Std summary type, including output schemas.
5. Draft QA checklist covering audio capture, transcription accuracy, and workspace permissions.
