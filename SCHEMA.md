# Journal.Vet – Supabase Schema

## Overview
The Journal.Vet data model is designed for Supabase/Postgres with strong multi-tenant guarantees, minimal coupling, and clear ownership boundaries. Every authenticated user automatically owns a “core” workspace whose ID matches their user ID; that equality check is what designates them as the core member. Additional collaborators join as standard members. Journals, templates, and vocabulary entries live at the workspace level and inherit the workspace’s permissions.

## Entity Relationship Summary
```
 auth.users ──┐
              ▼
        profiles ──┐
                   │1
                   │
                   ▼
              workspace_members ──────┐
                   ▲1                 │*
                   │                  ▼
              workspaces──────────── journals
                   │                  ▲
                   │                  │
                   │                  └── templates (Std or workspace)
                   │
                   ├── vocabulary_entries
                   │
                   └── invites
```
- **Std templates** are global records (no workspace_id) shared by every workspace.
- **Custom templates, vocabulary, journals, and invites** are scoped to the owning workspace.

## Table Specifications
Each table below includes the essential columns, constraints, and behavioural notes. Use Supabase migrations or SQL scripts to create them; data types are PostgreSQL defaults unless stated otherwise.

### 1. `profiles`
Stores per-user settings and maps 1:1 with `auth.users`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Same value as `auth.users.id`. |
| `full_name` | `text` | Optional display name. |
| `default_language_code` | `text` | ISO code (e.g., `en`, `es`). Nullable. |
| `default_template_id` | `uuid` FK → `templates.id` | Nullable; must reference a template visible to the user. |
| `current_workspace` | `uuid` FK → `workspaces.id` | Tracks the active workspace selection for the UI. Nullable. |
| `created_at` | `timestamptz` default `now()` | |
| `updated_at` | `timestamptz` default `now()` | updated via trigger. |

**Foreign keys**
- `id` references `auth.users(id)` on delete cascade.
- `default_template_id` references `templates(id)` on delete set null.

**RLS policies**
- Enable RLS.
- `SELECT`: `auth.uid() = id`.
- `UPDATE`: `auth.uid() = id` and any `current_workspace` value must belong to the caller (`public.is_workspace_member`).
- `INSERT`: system function ensures `auth.uid() = id` (handled via signup trigger).

### 2. `workspaces`
Represents the tenant boundary. The primary key is the owning user’s profile ID for core workspaces, guaranteeing every core workspace maps to a real user.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK, FK → `profiles.id` | Core workspace IDs equal the owner’s profile ID. |
| `name` | `text` | Clinic or personal workspace name. |
| `created_at` | `timestamptz` default `now()` | |

**RLS policies**
- `SELECT`: members only (`id` in memberships for `auth.uid()`).
- `INSERT/UPDATE/DELETE`: managed through trusted RPC/Edge Functions when additional workspaces are provisioned.

### 3. `workspace_members`
Links profiles to workspaces. Core membership is derived by comparing `workspace_id = user_id`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `workspace_id` | `uuid` FK → `workspaces.id` | |
| `user_id` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` default `now()` | |

**Constraints & indexes**
- Unique `(workspace_id, user_id)`.
- Index on `(user_id)` for quick workspace lookup.
- Trigger `prevent_leaving_core_workspace` blocks deleting the self-membership row for a core workspace.

**RLS policies**
- `SELECT`: users can view rows where they are a member.
- `INSERT/UPDATE/DELETE`: only allowed when `public.is_core_member(workspace_id)` evaluates true for the acting user; core membership equates to owning the workspace ID.

### 4. `templates`
Holds both standard (global) and workspace-specific summary templates.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `name` | `text` | Template label shown to users. |
| `body` | `text` | Prompt or structured template definition. |
| `kind` | `text` check in (`Std`,`Custom`) | Std rows have no `workspace_id`. |
| `language_code` | `text` | Optional default language hint. |
| `workspace_id` | `uuid` FK → `workspaces.id` | Nullable (NULL for Std templates). |
| `created_by` | `uuid` FK → `profiles.id` | Nullable (Std templates seeded with NULL). |
| `created_at` | `timestamptz` default `now()` | |
| `updated_at` | `timestamptz` default `now()` | |

**Indexes**
- `(workspace_id, kind)` to speed up listing.

**RLS policies**
- `SELECT`: everyone can read `kind = 'Std'`; otherwise must be a workspace member.
- `INSERT`: Core members for a workspace; Sub members only if `created_by = auth.uid()` and workspace matches membership.
- `UPDATE`: Core members unrestricted within workspace; Sub members limited to rows they created.
- `DELETE`: Core members only.

### 5. `vocabulary_entries`
Workspace dictionaries that fix recurring transcription issues.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `workspace_id` | `uuid` FK → `workspaces.id` | |
| `term` | `text` | Word/phrase to match in transcripts. |
| `replacement` | `text` | Replacement spelling/phrase. Optional but recommended. |
| `notes` | `text` | Optional context. |
| `created_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` default `now()` | |

**Constraints**
- Unique `(workspace_id, term)`.

**RLS policies**
- `SELECT`: workspace members only.
- `INSERT`: members of the workspace.
- `UPDATE/DELETE`: Core members; optionally allow Sub members to modify their own entries depending on product decision (default: Core only).

### 6. `journals`
Represents a single audio capture and its derived outputs.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `workspace_id` | `uuid` FK → `workspaces.id` | |
| `created_by` | `uuid` FK → `profiles.id` | Nullable (set null if user deleted). |
| `status` | `text` check in (`draft`,`processed`,`error`) default `'draft'` | |
| `language_code` | `text` | Selected at save time (prefilled from profile). |
| `template_id` | `uuid` FK → `templates.id` | Nullable (template may be deleted later). |
| `audio_path` | `text` | Storage path to raw audio. |
| `transcript` | `text` | Nullable; filled after ASR. |
| `summary` | `text` | Nullable; filled after LLM run. |
| `meta` | `jsonb` default `'{}'` | Duration, device info, pricing, etc. |
| `created_at` | `timestamptz` default `now()` | |
| `updated_at` | `timestamptz` default `now()` | |

**Indexes**
- `(workspace_id, created_at DESC)` for dashboards.

**RLS policies**
- `SELECT`: workspace members.
- `INSERT`: members where `workspace_id` is in their memberships and `created_by = auth.uid()`.
- `UPDATE`: Core members may update any row; Sub members may update rows they created (optional relaxation for note corrections).
- `DELETE`: Core members only.

### 7. `invites`
Tracks pending workspace invitations and their acceptance.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `workspace_id` | `uuid` FK → `workspaces.id` | |
| `email` | `text` | Invitee email. |
| `status` | `text` check in (`pending`,`accepted`,`declined`,`revoked`,`expired`) default `'pending'` | |
| `token` | `text` unique | Used for acceptance link. |
| `invited_by` | `uuid` FK → `profiles.id` | |
| `created_at` | `timestamptz` default `now()` | |
| `expires_at` | `timestamptz` | Nullable expiration. |

**RLS policies**
- Visible and writable only by core members (`public.is_core_member(workspace_id)`). Acceptance flow executed via RPC validates the token and inserts into `workspace_members` if the caller is authenticated.

### 8. `languages` (optional helper)
Provides lookup values for UI dropdowns.

| Column | Type | Notes |
|--------|------|-------|
| `code` | `text` PK | e.g., `en`, `fr`, `da`. |
| `label` | `text` | Human-readable name. |

RLS allows public `SELECT`; modifications restricted to service role.

## Triggers & Functions
- `set_updated_at()` – `BEFORE UPDATE` trigger to auto-update `updated_at` on `profiles`, `templates`, and `journals`.
- `handle_new_user()` – `AFTER INSERT` trigger on `auth.users`. Responsibilities:
  1. Insert a matching `profiles` row (`id = new.id`).
  2. Create the default workspace with `id = new.id` so the workspace owner is always a real user.
  3. Insert `workspace_members (workspace_id = new.id, user_id = new.id)` so the workspace appears in switchers.
- `prevent_leaving_core_workspace()` – `BEFORE DELETE` trigger on `workspace_members` that blocks deleting the self-membership row (`workspace_id = user_id`).
- `accept_invite(token text)` – validates invite token, checks expiry, inserts the member, and marks the invite `status = 'accepted'`.
- `decline_invite(invite_id uuid)` – allows invitees to decline pending invitations addressed to their email.
- `get_pending_invites_for_user()` – lists active invites for the authenticated user, including workspace metadata.
- `process_journal(journal_id uuid)` – orchestrates the transcription → vocabulary cleanup → summarisation pipeline. Called via trigger/Edge Function when a journal transitions out of draft.

## Row Level Security Overview
| Table | Select | Insert | Update | Delete |
|-------|--------|--------|--------|--------|
| `profiles` | Owner only | Signup trigger | Owner only | N/A (cascade) |
| `workspaces` | Members | Server-side only | Core via RPC | Core via RPC |
| `workspace_members` | Members | Core (workspace owner) | Core (workspace owner) | Core (workspace owner) |
| `templates` | Members + global Std | Core/Sub (see rules) | Core or creator | Core |
| `vocabulary_entries` | Members | Members | Core (optionally creator) | Core |
| `journals` | Members | Members | Core or creator | Core |
| `invites` | Core | Core | Core | Core |
| `languages` | Public read | Service role | Service role | Service role |

Policies should leverage helper views/functions (e.g., `is_workspace_member(workspace_id)` returning boolean) for readability.

## Storage Buckets
- `audio` (private) – raw uploads. Path convention: `{workspace_id}/{journal_id}/{timestamp}.webm`.
- `exports` (private) – generated PDFs/Docs/Emails. Path convention: `{workspace_id}/{journal_id}/{export_id}.pdf`.
- Signed URLs limited to short expiry for playback/download.

## Seed Data
Insert global templates during migration:
```sql
INSERT INTO templates (id, name, body, kind)
VALUES
  (gen_random_uuid(), 'Bulleted Points', '...', 'Std'),
  (gen_random_uuid(), 'Clean Transcript', '...', 'Std'),
  (gen_random_uuid(), 'Email', '...', 'Std'),
  (gen_random_uuid(), 'Post-Operative Report', '...', 'Std'),
  (gen_random_uuid(), 'Client Callback', '...', 'Std'),
  (gen_random_uuid(), 'Physical Exam', '...', 'Std'),
  (gen_random_uuid(), 'SOAP Ezyvet', '...', 'Std'),
  (gen_random_uuid(), 'SOAP Framework', '...', 'Std');
```
Replace the `body` column with real prompt content before launch. Seed optional languages table if used (e.g., English, Danish, Spanish).

## Indexing Recommendations
- `workspace_members(workspace_id, user_id)` and `(user_id)`.
- `journals(workspace_id, created_at DESC)`.
- `templates(workspace_id, kind)`.
- `vocabulary_entries(workspace_id, term)`.
- `invites(workspace_id, status)` (optional for reporting).

## Migration Order
1. `profiles`
2. `workspaces`
3. `workspace_members`
4. `templates` (then seed Std templates)
5. `vocabulary_entries`
6. `journals`
7. `invites`
8. `languages` (optional)
9. Triggers, helper functions, and RLS policies

## Operational Notes
- Keep application logic aligned with RLS: ensure users only select templates they can read, and update profile defaults when template visibility changes.
- Implement retries and failure logging inside `process_journal` for ASR/LLM outages; surface status updates to the UI.
- Audit columns (`meta`) should capture provider versions, job durations, and costs for future analytics.
