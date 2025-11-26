"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Profile = {
  full_name: string | null;
};

type WorkspaceSummary = {
  id: string;
  name: string;
};

type InviteRow = {
  id: string;
  email: string;
  status: string;
  created_at: string;
};

type ReceivedInviteRow = {
  id: string;
  workspace_id: string;
  workspace_name: string | null;
  status: string;
  created_at: string;
  token: string | null;
};

type BannerMessage = {
  tone: "error" | "info" | "success";
  text: string;
};

const deduplicateInvites = (items: InviteRow[]) => {
  const seenEmails = new Set<string>();

  return items.filter((item) => {
    const emailKey = item.email.toLowerCase();

    if (seenEmails.has(emailKey)) {
      return false;
    }

    seenEmails.add(emailKey);
    return true;
  });
};

const formatInviteDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
};

const formatInviteStatus = (status: string) => {
  switch (status) {
    case "pending":
      return "Pending";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "revoked":
      return "Revoked";
    case "expired":
      return "Expired";
    default:
      return status;
  }
};

export default function SettingsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [workspaceNameInput, setWorkspaceNameInput] = useState("");
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [formMessage, setFormMessage] = useState<BannerMessage | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState<BannerMessage | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [receivedInvites, setReceivedInvites] = useState<ReceivedInviteRow[]>([]);
  const [receivedInviteMessage, setReceivedInviteMessage] = useState<BannerMessage | null>(null);
  const [isLoadingReceivedInvites, setIsLoadingReceivedInvites] = useState(false);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadContext = async () => {
      setIsLoadingContext(true);
      setFormMessage(null);

      try {
        const {
          data: { user: supabaseUser },
          error: authError,
        } = await supabase.auth.getUser();

        if (!isActive) return;

        if (authError) {
          setFormMessage({ tone: "error", text: authError.message });
          return;
        }

        if (!supabaseUser) {
          router.push("/login");
          return;
        }

        setUser(supabaseUser);

        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", supabaseUser.id)
          .maybeSingle();

        if (!isActive) return;

        if (profileError) {
          setFormMessage({ tone: "error", text: profileError.message });
        } else {
          setProfile(profileRow ?? null);
          setDisplayNameInput(profileRow?.full_name ?? "");
        }

        const { data: workspaceRow, error: workspaceError } = await supabase
          .from("workspaces")
          .select("id, name")
          .eq("id", supabaseUser.id)
          .maybeSingle();

        if (!isActive) return;

        if (workspaceError) {
          setFormMessage({ tone: "error", text: workspaceError.message });
          setWorkspace(null);
          setWorkspaceNameInput("");
          return;
        }

        if (!workspaceRow) {
          setWorkspace(null);
          setWorkspaceNameInput("");
          setFormMessage({
            tone: "info",
            text: "We couldn’t load your workspace just yet.",
          });
          return;
        }

        setWorkspace({ id: workspaceRow.id, name: workspaceRow.name ?? "Untitled workspace" });
      } finally {
        if (isActive) {
          setIsLoadingContext(false);
        }
      }
    };

    void loadContext();

    return () => {
      isActive = false;
    };
  }, [router, supabase]);

  useEffect(() => {
    if (!workspace) {
      setWorkspaceNameInput("");
      return;
    }

    setWorkspaceNameInput(workspace.name);
  }, [workspace]);

  useEffect(() => {
    const workspaceId = workspace?.id;

    if (!workspaceId) {
      setInvites([]);
      setInviteMessage(null);
      setIsLoadingInvites(false);
      return;
    }

    let isActive = true;
    setIsLoadingInvites(true);
    setInviteMessage(null);

    const loadInvites = async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("id, email, status, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (!isActive) {
        return;
      }

      if (error) {
        setInviteMessage({ tone: "error", text: error.message });
        setInvites([]);
      } else {
        setInvites(deduplicateInvites(data ?? []));
      }

      setIsLoadingInvites(false);
    };

    void loadInvites();

    return () => {
      isActive = false;
    };
  }, [supabase, workspace]);

  useEffect(() => {
    const userEmail = user?.email;

    if (!userEmail) {
      setReceivedInvites([]);
      setReceivedInviteMessage(null);
      setIsLoadingReceivedInvites(false);
      return;
    }

    let isActive = true;
    setIsLoadingReceivedInvites(true);
    setReceivedInviteMessage(null);

    const loadReceivedInvites = async () => {
      const { data, error } = await supabase.rpc("get_pending_invites_for_user");

      if (!isActive) {
        return;
      }

      if (error) {
        setReceivedInviteMessage({ tone: "error", text: error.message });
        setReceivedInvites([]);
      } else {
        setReceivedInvites((data ?? []) as ReceivedInviteRow[]);
      }

      setIsLoadingReceivedInvites(false);
    };

    void loadReceivedInvites();

    return () => {
      isActive = false;
    };
  }, [supabase, user?.email]);

  const workspaceId = workspace?.id ?? null;
  const isCoreMember = workspaceId ? user?.id === workspaceId : false;

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) {
      setFormMessage({ tone: "error", text: "You need to be signed in to update your settings." });
      return;
    }

    setFormMessage(null);
    setIsSaving(true);

    const trimmedDisplayName = displayNameInput.trim();
    const originalDisplayName = profile?.full_name?.trim() ?? "";
    const shouldUpdateDisplayName = trimmedDisplayName !== originalDisplayName;

    let trimmedWorkspaceName = "";
    let shouldUpdateWorkspaceName = false;

    if (workspaceId) {
      trimmedWorkspaceName = workspaceNameInput.trim();
      const currentWorkspaceName = workspace?.name ?? "";

      if (!trimmedWorkspaceName) {
        setFormMessage({ tone: "error", text: "Workspace name is required." });
        setIsSaving(false);
        return;
      }

      if (!isCoreMember && trimmedWorkspaceName !== currentWorkspaceName) {
        setFormMessage({
          tone: "error",
          text: "Only the workspace owner can rename the workspace.",
        });
        setIsSaving(false);
        return;
      }

      shouldUpdateWorkspaceName = trimmedWorkspaceName !== currentWorkspaceName;
    }

    if (!shouldUpdateDisplayName && !shouldUpdateWorkspaceName) {
      setFormMessage({ tone: "info", text: "There were no changes to update." });
      setIsSaving(false);
      return;
    }

    try {
      const profileUpdatePromise = shouldUpdateDisplayName
        ? supabase
            .from("profiles")
            .update({ full_name: trimmedDisplayName || null })
            .eq("id", user.id)
            .select("full_name")
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const workspaceUpdatePromise =
        shouldUpdateWorkspaceName && workspaceId
          ? supabase
              .from("workspaces")
              .update({ name: trimmedWorkspaceName })
              .eq("id", workspaceId)
              .select("id, name")
              .maybeSingle()
          : Promise.resolve({ data: null, error: null });

      const [{ data: updatedProfile, error: profileError }, { data: updatedWorkspace, error: workspaceError }] =
        await Promise.all([profileUpdatePromise, workspaceUpdatePromise]);

      if (profileError) {
        throw new Error(profileError.message);
      }

      if (workspaceError) {
        throw new Error(workspaceError.message);
      }

      if (updatedProfile) {
        setProfile({ full_name: updatedProfile.full_name ?? null });
        setDisplayNameInput(updatedProfile.full_name ?? "");
      } else if (shouldUpdateDisplayName) {
        setProfile({ full_name: trimmedDisplayName || null });
        setDisplayNameInput(trimmedDisplayName);
      }

      if (updatedWorkspace) {
        setWorkspace((previous) =>
          previous ? { ...previous, name: updatedWorkspace.name ?? trimmedWorkspaceName } : previous
        );
        setWorkspaceNameInput(updatedWorkspace.name ?? trimmedWorkspaceName);
      } else if (shouldUpdateWorkspaceName && workspaceId) {
        setWorkspace((previous) =>
          previous ? { ...previous, name: trimmedWorkspaceName } : previous
        );
        setWorkspaceNameInput(trimmedWorkspaceName);
      }

      setFormMessage({ tone: "success", text: "Your profile settings have been saved." });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while saving your settings.";
      setFormMessage({ tone: "error", text: message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user || !workspaceId) {
      setInviteMessage({ tone: "error", text: "Your workspace is still loading. Try again shortly." });
      return;
    }

    if (!isCoreMember) {
      setInviteMessage({ tone: "error", text: "Only the workspace owner can send invitations." });
      return;
    }

    const trimmedEmail = inviteEmail.trim().toLowerCase();

    if (!trimmedEmail) {
      setInviteMessage({ tone: "error", text: "Enter an email address to send an invitation." });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setInviteMessage({ tone: "error", text: "Enter a valid email address." });
      return;
    }

    setIsInviting(true);
    setInviteMessage(null);

    const token =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replace(/-/g, "")
        : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("invites")
      .insert({
        workspace_id: workspaceId,
        email: trimmedEmail,
        token,
        invited_by: user.id,
        expires_at: expiresAt,
      })
      .select("id, email, status, created_at")
      .single();

    if (error) {
      setInviteMessage({ tone: "error", text: error.message });
      setIsInviting(false);
      return;
    }

    if (data) {
      setInvites((previous) => deduplicateInvites([data, ...previous]));
    }

    setInviteEmail("");
    setInviteMessage({ tone: "success", text: `Invitation sent to ${trimmedEmail}.` });
    setIsInviting(false);
  };

  const handleAcceptInvite = async (invite: ReceivedInviteRow) => {
    if (!invite.token || invite.status !== "pending") {
      return;
    }

    setRespondingInviteId(invite.id);
    setReceivedInviteMessage(null);

    const { error } = await supabase.rpc("accept_invite", { invite_token: invite.token });

    if (error) {
      setReceivedInviteMessage({ tone: "error", text: error.message });
      setRespondingInviteId(null);
      return;
    }

    setReceivedInvites((previous) =>
      previous.map((item) =>
        item.id === invite.id
          ? { ...item, status: "accepted", token: null }
          : item
      )
    );
    setReceivedInviteMessage({
      tone: "success",
      text: "Invitation accepted. You're now a member of the workspace.",
    });
    setRespondingInviteId(null);
  };

  const handleDeclineInvite = async (invite: ReceivedInviteRow) => {
    if (invite.status !== "pending") {
      return;
    }

    setRespondingInviteId(invite.id);
    setReceivedInviteMessage(null);

    const { error } = await supabase.rpc("decline_invite", { p_invite_id: invite.id });

    if (error) {
      setReceivedInviteMessage({ tone: "error", text: error.message });
      setRespondingInviteId(null);
      return;
    }

    setReceivedInvites((previous) => previous.filter((item) => item.id !== invite.id));
    setReceivedInviteMessage({ tone: "success", text: "Invitation declined." });
    setRespondingInviteId(null);
  };

  const handleLeaveInvite = async (invite: ReceivedInviteRow) => {
    if (invite.status !== "accepted") {
      return;
    }

    setRespondingInviteId(invite.id);
    setReceivedInviteMessage(null);

    const { error } = await supabase.rpc("revoke_invite", { p_invite_id: invite.id });

    if (error) {
      setReceivedInviteMessage({ tone: "error", text: error.message });
      setRespondingInviteId(null);
      return;
    }

    setReceivedInvites((previous) => previous.filter((item) => item.id !== invite.id));
    setReceivedInviteMessage({ tone: "success", text: "You left the workspace." });
    setRespondingInviteId(null);
  };

  const handleRevokeInvite = async (invite: InviteRow) => {
    if (!isCoreMember || invite.status === "revoked" || invite.status === "expired") {
      return;
    }

    setRevokingInviteId(invite.id);
    setInviteMessage(null);

    const { error } = await supabase.rpc("revoke_invite", { p_invite_id: invite.id });

    if (error) {
      setInviteMessage({ tone: "error", text: error.message });
      setRevokingInviteId(null);
      return;
    }

    setInvites((previous) =>
      deduplicateInvites(
        previous.map((item) =>
          item.id === invite.id
            ? { ...item, status: "revoked" }
            : item
        )
      )
    );

    const wasAccepted = invite.status === "accepted";
    setInviteMessage({
      tone: "success",
      text: wasAccepted
        ? `${invite.email} has been removed from the workspace.`
        : `Invitation to ${invite.email} has been revoked.`,
    });
    setRevokingInviteId(null);
  };

  return (
    <main className="settings-page">
      <div className="settings-shell">
        <header className="settings-hero">
          <Link href="/dashboard" className="settings-back">
            <span aria-hidden="true" className="settings-back__icon">
              ←
            </span>
            Back to dashboard
          </Link>
          <div className="settings-hero__copy">
            <span className="settings-hero__label">Profile</span>
            <h1 className="settings-hero__title">Profile settings</h1>
            <p className="settings-hero__subtitle">
              Update your display name, workspace details, and invite teammates.
            </p>
          </div>
        </header>

        {formMessage ? (
          <p
            className={`auth-message settings-message ${
              formMessage.tone === "error"
                ? "auth-message--error"
                : formMessage.tone === "success"
                ? "auth-message--success"
                : "auth-message--info"
            }`}
            role={formMessage.tone === "error" ? "alert" : "status"}
          >
            {formMessage.text}
          </p>
        ) : null}

        <section className="settings-card">
          <form className="settings-form" onSubmit={handleSave}>
            <div className="settings-section">
              <h2>Profile</h2>
              <p>Control how your name appears to other members in the workspace.</p>
              <div className="settings-field">
                <label htmlFor="displayName">Display name</label>
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  className="auth-input"
                  placeholder={user?.email ?? "Your name"}
                  autoComplete="name"
                  value={displayNameInput}
                  onChange={(event) => setDisplayNameInput(event.target.value)}
                  disabled={isLoadingContext || isSaving}
                />
                <p className="settings-field__hint">Leave blank to fall back to your email address.</p>
              </div>
            </div>

            <div className="settings-section">
              <h2>Workspace</h2>
              <p>Change the name of your workspace.</p>
              <div className="settings-field">
                <label htmlFor="workspaceName">Workspace name</label>
                <input
                  id="workspaceName"
                  name="workspaceName"
                  type="text"
                  className="auth-input"
                  value={workspaceNameInput}
                  onChange={(event) => setWorkspaceNameInput(event.target.value)}
                  disabled={
                    isLoadingContext || !workspaceId || !isCoreMember || isSaving
                  }
                />
                {!isCoreMember ? (
                  <p className="settings-field__hint">
                    Only the workspace owner can rename this workspace.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="settings-actions">
              <button
                type="submit"
                className="btn btn-primary settings-actions__save"
                disabled={isSaving || isLoadingContext}
              >
                {isSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </section>

        <section className="settings-card">
          <div className="settings-section settings-section--header">
            <div>
              <h2>Invite teammates</h2>
              <p>Send invites so colleagues can access this workspace.</p>
            </div>
          </div>

          <form className="settings-inline-form" onSubmit={handleInvite}>
            <label className="visually-hidden" htmlFor="inviteEmail">
              Teammate email address
            </label>
            <input
              id="inviteEmail"
              name="inviteEmail"
              type="email"
              className="auth-input settings-inline-form__input"
              placeholder="vet@example.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              disabled={
                isLoadingContext || !workspaceId || !isCoreMember || isInviting
              }
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                isLoadingContext || !workspaceId || !isCoreMember || isInviting
              }
            >
              {isInviting ? "Sending…" : "Send invite"}
            </button>
          </form>

          {inviteMessage ? (
            <p
              className={`auth-message settings-message ${
                inviteMessage.tone === "error"
                  ? "auth-message--error"
                  : inviteMessage.tone === "success"
                  ? "auth-message--success"
                  : "auth-message--info"
              }`}
              role={inviteMessage.tone === "error" ? "alert" : "status"}
            >
              {inviteMessage.text}
            </p>
          ) : null}

          <div className="settings-invite-list">
            {isLoadingInvites ? (
              <p className="settings-inline-hint">Loading invites…</p>
            ) : invites.length === 0 ? (
              <p className="settings-inline-hint">No invites sent just yet.</p>
            ) : (
              <ul className="settings-invite-items" role="list">
                {invites.map((invite) => {
                  const canRevoke =
                    isCoreMember &&
                    invite.status !== "revoked" &&
                    invite.status !== "declined" &&
                    invite.status !== "expired";

                  return (
                    <li
                      key={invite.id}
                      className={`settings-invite-item ${
                        canRevoke ? "settings-invite-item--actionable" : ""
                      }`}
                    >
                      <div className="settings-invite-item__details">
                        <span className="settings-invite-item__email">{invite.email}</span>
                        <span className="settings-invite-item__meta">{formatInviteDate(invite.created_at)}</span>
                      </div>
                      <div className="settings-invite-actions">
                        <span className={`settings-status settings-status--${invite.status}`}>
                          {formatInviteStatus(invite.status)}
                        </span>
                        {canRevoke ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleRevokeInvite(invite)}
                            disabled={revokingInviteId === invite.id}
                          >
                            {revokingInviteId === invite.id
                              ? "Working…"
                              : invite.status === "accepted"
                              ? "Remove"
                              : "Revoke"}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {!isCoreMember && workspaceId ? (
            <p className="settings-inline-hint">
              You can view invites, but only the workspace owner can send new ones.
            </p>
          ) : null}
        </section>

        <section className="settings-card">
          <div className="settings-section">
            <h2>Invites</h2>
            <p>Respond to open workspace invitations sent to your email address.</p>
          </div>

          {receivedInviteMessage ? (
            <p
              className={`auth-message settings-message ${
                receivedInviteMessage.tone === "error"
                  ? "auth-message--error"
                  : receivedInviteMessage.tone === "success"
                  ? "auth-message--success"
                  : "auth-message--info"
              }`}
              role={receivedInviteMessage.tone === "error" ? "alert" : "status"}
            >
              {receivedInviteMessage.text}
            </p>
          ) : null}

          <div className="settings-invite-list">
            {isLoadingReceivedInvites ? (
              <p className="settings-inline-hint">Loading your invites…</p>
            ) : receivedInvites.length === 0 ? (
              <p className="settings-inline-hint">You have no pending invites.</p>
            ) : (
              <ul className="settings-invite-items" role="list">
                {receivedInvites.map((invite) => {
                  const canAccept = invite.status === "pending";
                  const canLeave = invite.status === "accepted";

                  return (
                    <li
                      key={invite.id}
                      className={`settings-invite-item ${
                        canAccept || canLeave ? "settings-invite-item--actionable" : ""
                      }`}
                    >
                      <div className="settings-invite-item__details">
                        <span className="settings-invite-item__email">
                          {invite.workspace_name || "Untitled workspace"}
                        </span>
                        <span className="settings-invite-item__meta">
                          Invited {formatInviteDate(invite.created_at)}
                        </span>
                      </div>
                      <div className="settings-invite-actions">
                        <span className={`settings-status settings-status--${invite.status}`}>
                          {formatInviteStatus(invite.status)}
                        </span>
                        {canAccept ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleDeclineInvite(invite)}
                              disabled={respondingInviteId === invite.id}
                            >
                              {respondingInviteId === invite.id ? "Working…" : "Decline"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleAcceptInvite(invite)}
                              disabled={respondingInviteId === invite.id}
                            >
                              {respondingInviteId === invite.id ? "Working…" : "Accept"}
                            </button>
                          </>
                        ) : null}
                        {canLeave ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleLeaveInvite(invite)}
                            disabled={respondingInviteId === invite.id}
                          >
                            {respondingInviteId === invite.id ? "Working…" : "Leave"}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
