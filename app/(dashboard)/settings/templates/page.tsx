"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveWorkspaceContext, type WorkspaceSummary } from "@/lib/workspaces";

const formatUpdatedAt = (value: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
};

const formatKind = (kind: string) => {
  if (!kind) return "Unknown";
  const normalized = kind.toLowerCase();
  if (normalized === "std") return "Standard";
  if (normalized === "custom") return "Custom";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
};

const getKindModifier = (kind: string) => {
  if (!kind) return "unknown";
  return kind.toLowerCase().replace(/[^a-z0-9]+/g, "-");
};

type Template = {
  id: string;
  name: string;
  body: string;
  kind: string;
  language_code: string | null;
  workspace_id?: string | null;
  updated_at: string;
  created_by?: string | null;
};

type ToastMessage = {
  tone: "success" | "error";
  text: string;
};

type CreateTemplateErrors = {
  name?: string;
  body?: string;
  submit?: string;
};

type BannerMessage = {
  tone: "error" | "info" | "success";
  text: string;
};

type TemplateSectionState = {
  isLoading: boolean;
  message: BannerMessage | null;
};

export default function TemplateLibraryPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [contextMessage, setContextMessage] = useState<BannerMessage | null>(null);
  const [customTemplates, setCustomTemplates] = useState<Template[]>([]);
  const [standardTemplates, setStandardTemplates] = useState<Template[]>([]);
  const [customState, setCustomState] = useState<TemplateSectionState>({
    isLoading: true,
    message: null,
  });
  const [standardState, setStandardState] = useState<TemplateSectionState>({
    isLoading: true,
    message: null,
  });
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    body: "",
  });
  const [createErrors, setCreateErrors] = useState<CreateTemplateErrors>({});
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    body: "",
  });
  const [editErrors, setEditErrors] = useState<CreateTemplateErrors>({});
  const [isUpdatingTemplate, setIsUpdatingTemplate] = useState(false);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadContext = async () => {
      setIsLoadingContext(true);
      setContextMessage(null);

      try {
        const {
          data: { user: supabaseUser },
          error: authError,
        } = await supabase.auth.getUser();

        if (!isActive) return;

        if (authError) {
          setContextMessage({ tone: "error", text: authError.message });
          return;
        }

        if (!supabaseUser) {
          router.push("/login");
          return;
        }

        setUser(supabaseUser);

        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("current_workspace")
          .eq("id", supabaseUser.id)
          .maybeSingle();

        if (!isActive) return;

        if (profileError) {
          setContextMessage({ tone: "error", text: profileError.message });
        }

        const context = await resolveWorkspaceContext({
          supabase,
          userId: supabaseUser.id,
          ownerWorkspaceId: supabaseUser.id,
          storedWorkspaceId: profileRow?.current_workspace ?? null,
        });

        if (!isActive) return;

        setWorkspace(context.activeWorkspace);

        if (context.status === "error" && context.message) {
          setContextMessage({ tone: "error", text: context.message });
        } else if (context.status === "empty" && context.message) {
          setContextMessage({ tone: "info", text: context.message });
        } else {
          setContextMessage(null);
        }

        if (context.shouldPersistSelection) {
          const { error: persistError } = await supabase
            .from("profiles")
            .update({ current_workspace: context.activeWorkspaceId })
            .eq("id", supabaseUser.id);

          if (!isActive) return;

          if (persistError) {
            setContextMessage({ tone: "error", text: persistError.message });
          } else {
            setWorkspace(context.activeWorkspace);
          }
        }
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
    let isActive = true;

    const loadCustomTemplates = async () => {
      const workspaceId = workspace?.id;

      if (!workspaceId) {
        if (!isActive) return;
        setCustomTemplates([]);
        setCustomState(
          isLoadingContext
            ? { isLoading: true, message: null }
            : {
                isLoading: false,
                message: {
                  tone: "info",
                  text: "No workspace selected yet.",
                },
              },
        );
        return;
      }

      if (!isActive) return;
      setCustomState({ isLoading: true, message: null });

      const { data, error } = await supabase
        .from("templates")
        .select("id,name,body,kind,language_code,workspace_id,updated_at,created_by")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false });

      if (!isActive) return;

      if (error) {
        setCustomTemplates([]);
        setCustomState({
          isLoading: false,
          message: { tone: "error", text: error.message },
        });
        return;
      }

      setCustomTemplates(data ?? []);
      setCustomState({
        isLoading: false,
        message:
          !data || data.length === 0
            ? {
                tone: "info",
                text: "Create a custom template to see it listed here.",
              }
            : null,
      });
    };

    void loadCustomTemplates();

    return () => {
      isActive = false;
    };
  }, [isLoadingContext, supabase, workspace]);

  useEffect(() => {
    let isActive = true;

    const loadStandardTemplates = async () => {
      setStandardState({ isLoading: true, message: null });

      const { data, error } = await supabase
        .from("templates")
        .select("id,name,body,kind,language_code,updated_at")
        .eq("kind", "Std")
        .order("name");

      if (!isActive) return;

      if (error) {
        setStandardTemplates([]);
        setStandardState({
          isLoading: false,
          message: { tone: "error", text: error.message },
        });
        return;
      }

      setStandardTemplates(data ?? []);
      setStandardState({
        isLoading: false,
        message:
          !data || data.length === 0
            ? {
                tone: "info",
                text: "Standard templates will appear here once they’re available.",
              }
            : null,
      });
    };

    void loadStandardTemplates();

    return () => {
      isActive = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!selectedTemplate) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedTemplate(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedTemplate]);

  useEffect(() => {
    if (!isCreateModalOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!isSavingTemplate) {
          setIsCreateModalOpen(false);
          setCreateErrors({});
          setCreateForm({ name: "", body: "" });
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCreateModalOpen, isSavingTemplate]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toast]);

  const handleOpenCreateModal = () => {
    setCreateForm({ name: "", body: "" });
    setCreateErrors({});
    setIsCreateModalOpen(true);
  };

  useEffect(() => {
    if (!selectedTemplate || selectedTemplate.kind?.toLowerCase() !== "custom") {
      setEditForm({ name: "", body: "" });
      setEditErrors({});
      setIsUpdatingTemplate(false);
      setIsDeletingTemplate(false);
      return;
    }

    setEditForm({
      name: selectedTemplate.name ?? "",
      body: selectedTemplate.body ?? "",
    });
    setEditErrors({});
    setIsUpdatingTemplate(false);
    setIsDeletingTemplate(false);
  }, [selectedTemplate]);

  const handleCloseSelectedTemplate = () => {
    setSelectedTemplate(null);
    setEditErrors({});
  };

  const handleCloseCreateModal = () => {
    if (isSavingTemplate) {
      return;
    }

    setIsCreateModalOpen(false);
    setCreateErrors({});
    setCreateForm({ name: "", body: "" });
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSavingTemplate) {
      return;
    }

    const trimmedName = createForm.name.trim();
    const trimmedBody = createForm.body.trim();
    const validationErrors: CreateTemplateErrors = {};

    if (!trimmedName) {
      validationErrors.name = "Please enter a template name.";
    }

    if (!trimmedBody) {
      validationErrors.body = "Summary instructions are required.";
    }

    if (Object.keys(validationErrors).length > 0) {
      setCreateErrors(validationErrors);
      return;
    }

    if (!workspace?.id) {
      setCreateErrors({
        submit: "A workspace is required before creating templates.",
      });
      return;
    }

    if (!user?.id) {
      setCreateErrors({
        submit: "You need to be signed in to create templates.",
      });
      return;
    }

    setIsSavingTemplate(true);
    setCreateErrors({});

    const { data, error } = await supabase
      .from("templates")
      .insert([
        {
          name: trimmedName,
          body: trimmedBody,
          kind: "Custom",
          workspace_id: workspace.id,
          created_by: user.id,
        },
      ])
      .select("id,name,body,kind,language_code,workspace_id,updated_at,created_by")
      .single();

    if (error) {
      setCreateErrors({ submit: error.message });
      setIsSavingTemplate(false);
      return;
    }

    if (data) {
      setCustomTemplates((previous) => {
        const withoutNew = previous.filter((template) => template.id !== data.id);
        return [data, ...withoutNew];
      });
      setCustomState({ isLoading: false, message: null });
      setToast({ tone: "success", text: "Template created successfully." });
    }

    setIsSavingTemplate(false);
    setIsCreateModalOpen(false);
    setCreateForm({ name: "", body: "" });
    setCreateErrors({});
  };

  const handleUpdateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedTemplate || selectedTemplate.kind?.toLowerCase() !== "custom") {
      return;
    }

    const isCoreMember = workspace ? user?.id === workspace.id : false;
    const canEditTemplate = isCoreMember || selectedTemplate.created_by === user?.id;

    if (!canEditTemplate) {
      setEditErrors({ submit: "You don’t have permission to save changes." });
      setToast({
        tone: "error",
        text: "You don’t have permission to save changes.",
      });
      return;
    }

    const trimmedName = editForm.name.trim();
    const trimmedBody = editForm.body.trim();

    if (!trimmedName) {
      setEditErrors({ name: "Name is required." });
      return;
    }

    if (!trimmedBody) {
      setEditErrors({ body: "Summary instructions are required." });
      return;
    }

    setEditErrors({});
    setIsUpdatingTemplate(true);

    const { data, error } = await supabase
      .from("templates")
      .update({
        name: trimmedName,
        body: trimmedBody,
      })
      .eq("id", selectedTemplate.id)
      .select(
        "id,name,body,kind,language_code,workspace_id,updated_at,created_by",
      )
      .single();

    if (error) {
      setEditErrors({ submit: error.message });
      setToast({ tone: "error", text: error.message });
      setIsUpdatingTemplate(false);
      return;
    }

    if (data) {
      setCustomTemplates((previous) => {
        const withoutCurrent = previous.filter((template) => template.id !== data.id);
        return [data, ...withoutCurrent];
      });
      setCustomState({ isLoading: false, message: null });
      setSelectedTemplate(data);
      setToast({ tone: "success", text: "Template updated successfully." });
    }

    setIsUpdatingTemplate(false);
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate || selectedTemplate.kind?.toLowerCase() !== "custom") {
      return;
    }

    const isCoreMember = workspace ? user?.id === workspace.id : false;

    if (!isCoreMember) {
      setToast({
        tone: "error",
        text: "Only workspace core members can delete templates.",
      });
      return;
    }

    setIsDeletingTemplate(true);

    const { error } = await supabase.from("templates").delete().eq("id", selectedTemplate.id);

    if (error) {
      setToast({ tone: "error", text: error.message });
      setIsDeletingTemplate(false);
      return;
    }

    setCustomTemplates((previous) => {
      const updated = previous.filter((template) => template.id !== selectedTemplate.id);
      setCustomState({
        isLoading: false,
        message:
          updated.length === 0
            ? {
                tone: "info",
                text: "Create a custom template to see it listed here.",
              }
            : null,
      });
      return updated;
    });
    setToast({ tone: "success", text: "Template deleted successfully." });
    setIsDeletingTemplate(false);
    handleCloseSelectedTemplate();
  };

  const activeWorkspaceName = workspace?.name ?? "Loading workspace…";
  const modalTitleId = selectedTemplate ? `template-modal-title-${selectedTemplate.id}` : undefined;
  const isCoreMember = workspace ? user?.id === workspace.id : false;
  const isCustomSelected = selectedTemplate?.kind?.toLowerCase() === "custom";
  const canEditSelectedTemplate = Boolean(
    isCustomSelected &&
      selectedTemplate &&
      (isCoreMember || selectedTemplate.created_by === user?.id),
  );
  const hasEditChanges = Boolean(
    isCustomSelected &&
      selectedTemplate &&
      (editForm.name !== (selectedTemplate.name ?? "") ||
        editForm.body !== (selectedTemplate.body ?? "")),
  );

  return (
    <main className="settings-page templates-page">
      {toast ? (
        <div
          className={`templates-toast ${
            toast.tone === "success"
              ? "templates-toast--success"
              : "templates-toast--error"
          }`}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          {toast.text}
        </div>
      ) : null}
      <div className="settings-shell">
        <header className="settings-hero">
          <div className="settings-hero__top">
            <Link href="/settings" className="settings-back">
              <span aria-hidden="true" className="settings-back__icon">
                ←
              </span>
              Back to profile
            </Link>
            <button
              type="button"
              className="btn btn-primary templates-create-button"
              onClick={handleOpenCreateModal}
              disabled={isLoadingContext || !workspace}
            >
              Create template
            </button>
          </div>
          <div className="settings-hero__copy">
            <span className="settings-hero__label">Templates</span>
            <h1 className="settings-hero__title">Template library</h1>
            <p className="settings-hero__subtitle">
              Review standard options and the custom templates available to {activeWorkspaceName}.
            </p>
          </div>
        </header>

        {contextMessage ? (
          <p
            className={`auth-message settings-message ${
              contextMessage.tone === "error"
                ? "auth-message--error"
                : contextMessage.tone === "success"
                ? "auth-message--success"
                : "auth-message--info"
            }`}
            role={contextMessage.tone === "error" ? "alert" : "status"}
          >
            {contextMessage.text}
          </p>
        ) : null}

        <section className="settings-card templates-section">
          <div className="templates-section__header">
            <h2 className="templates-section__title">Custom templates</h2>
            <span className="templates-section__badge">{customTemplates.length} total</span>
          </div>
          {customState.isLoading ? (
            <div className="templates-empty">Loading custom templates…</div>
          ) : customState.message ? (
            <div
              className={`templates-empty ${
                customState.message.tone === "error" ? "templates-empty--error" : ""
              }`}
              role={customState.message.tone === "error" ? "alert" : "status"}
            >
              {customState.message.text}
            </div>
          ) : (
            <ul className="templates-list" role="list">
              {customTemplates.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    className="template-card"
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <div className="template-card__header">
                      <h3 className="template-card__name">{template.name}</h3>
                      <span className={`template-badge template-badge--${getKindModifier(template.kind)}`}>
                        {formatKind(template.kind)}
                      </span>
                    </div>
                    <div className="template-card__meta">
                      <span className="template-card__updated">
                        Updated {formatUpdatedAt(template.updated_at)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="settings-card templates-section">
          <div className="templates-section__header">
            <h2 className="templates-section__title">Standard templates</h2>
            <span className="templates-section__badge">{standardTemplates.length} total</span>
          </div>
          {standardState.isLoading ? (
            <div className="templates-empty">Loading standard templates…</div>
          ) : standardState.message ? (
            <div
              className={`templates-empty ${
                standardState.message.tone === "error" ? "templates-empty--error" : ""
              }`}
              role={standardState.message.tone === "error" ? "alert" : "status"}
            >
              {standardState.message.text}
            </div>
          ) : (
            <ul className="templates-list" role="list">
              {standardTemplates.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    className="template-card"
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <div className="template-card__header">
                      <h3 className="template-card__name">{template.name}</h3>
                      <span className={`template-badge template-badge--${getKindModifier(template.kind)}`}>
                        {formatKind(template.kind)}
                      </span>
                    </div>
                    <div className="template-card__meta">
                      <span className="template-card__updated">
                        Updated {formatUpdatedAt(template.updated_at)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {isCreateModalOpen ? (
        <div className="templates-modal" role="dialog" aria-modal="true" aria-labelledby="create-template-title">
          <div
            className="templates-modal__overlay"
            onClick={handleCloseCreateModal}
            aria-hidden="true"
          />
          <div className="templates-modal__dialog templates-modal__dialog--form" role="document">
            <div className="templates-modal__header">
              <h2 className="templates-modal__title" id="create-template-title">
                Create template
              </h2>
              <button
                type="button"
                className="templates-modal__close"
                onClick={handleCloseCreateModal}
                aria-label="Close create template modal"
                disabled={isSavingTemplate}
              >
                ×
              </button>
            </div>
            <form className="templates-form" onSubmit={handleCreateSubmit}>
              <div className="templates-form__field">
                <label htmlFor="templateName">Name</label>
                <input
                  id="templateName"
                  name="templateName"
                  type="text"
                  className="auth-input"
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  disabled={isSavingTemplate}
                  required
                />
                {createErrors.name ? (
                  <p className="templates-form__error" role="alert">
                    {createErrors.name}
                  </p>
                ) : null}
              </div>
              <div className="templates-form__field">
                <label htmlFor="templateBody">Summary instructions</label>
                <textarea
                  id="templateBody"
                  name="templateBody"
                  className="auth-input templates-form__textarea"
                  value={createForm.body}
                  onChange={(event) =>
                    setCreateForm((previous) => ({
                      ...previous,
                      body: event.target.value,
                    }))
                  }
                  disabled={isSavingTemplate}
                  required
                />
                {createErrors.body ? (
                  <p className="templates-form__error" role="alert">
                    {createErrors.body}
                  </p>
                ) : null}
              </div>
              {createErrors.submit ? (
                <p className="templates-form__error" role="alert">
                  {createErrors.submit}
                </p>
              ) : null}
              <div className="templates-form__actions">
                <button
                  type="button"
                  className="btn templates-form__cancel"
                  onClick={handleCloseCreateModal}
                  disabled={isSavingTemplate}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary templates-form__submit"
                  disabled={isSavingTemplate}
                >
                  {isSavingTemplate ? "Saving…" : "Save template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedTemplate ? (
        <div className="templates-modal" role="dialog" aria-modal="true" aria-labelledby={modalTitleId}>
          <div
            className="templates-modal__overlay"
            onClick={handleCloseSelectedTemplate}
            aria-hidden="true"
          />
          <div className="templates-modal__dialog" role="document">
            <div className="templates-modal__header">
              <h2 className="templates-modal__title" id={modalTitleId}>
                {selectedTemplate.name}
              </h2>
              <button
                type="button"
                className="templates-modal__close"
                onClick={handleCloseSelectedTemplate}
                aria-label="Close template details"
              >
                ×
              </button>
            </div>
            <div className="templates-modal__body">
              {isCustomSelected ? (
                <form className="templates-form" onSubmit={handleUpdateSubmit}>
                  <div className="templates-form__field">
                    <label htmlFor="editTemplateName">Name</label>
                    <input
                      id="editTemplateName"
                      name="editTemplateName"
                      className="auth-input"
                      value={editForm.name}
                      onChange={(event) =>
                        setEditForm((previous) => ({
                          ...previous,
                          name: event.target.value,
                        }))
                      }
                      disabled={!canEditSelectedTemplate || isUpdatingTemplate}
                      required
                    />
                    {editErrors.name ? (
                      <p className="templates-form__error" role="alert">
                        {editErrors.name}
                      </p>
                    ) : null}
                  </div>
                  <div className="templates-form__field">
                    <label htmlFor="editTemplateBody">Summary instructions</label>
                    <textarea
                      id="editTemplateBody"
                      name="editTemplateBody"
                      className="auth-input templates-form__textarea"
                      value={editForm.body}
                      onChange={(event) =>
                        setEditForm((previous) => ({
                          ...previous,
                          body: event.target.value,
                        }))
                      }
                      disabled={!canEditSelectedTemplate || isUpdatingTemplate}
                      required
                    />
                    {editErrors.body ? (
                      <p className="templates-form__error" role="alert">
                        {editErrors.body}
                      </p>
                    ) : null}
                  </div>
                  {editErrors.submit ? (
                    <p className="templates-form__error" role="alert">
                      {editErrors.submit}
                    </p>
                  ) : null}
                  <p className="templates-form__hint">
                    Workspace core members and template creators can save changes to custom templates.
                  </p>
                  <div className="templates-form__actions">
                    <button
                      type="button"
                      className="btn templates-form__cancel"
                      onClick={handleCloseSelectedTemplate}
                      disabled={isUpdatingTemplate || isDeletingTemplate}
                    >
                      Close
                    </button>
                    {isCoreMember ? (
                      <button
                        type="button"
                        className="btn templates-form__cancel"
                        onClick={handleDeleteTemplate}
                        disabled={isDeletingTemplate || isUpdatingTemplate}
                      >
                        {isDeletingTemplate ? "Deleting…" : "Delete"}
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      className="btn btn-primary templates-form__submit"
                      disabled={
                        !canEditSelectedTemplate ||
                        isUpdatingTemplate ||
                        !hasEditChanges
                      }
                    >
                      {isUpdatingTemplate ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="templates-modal__field">
                    <span className="templates-modal__label">Name</span>
                    <p className="templates-modal__value">{selectedTemplate.name}</p>
                  </div>
                  <div className="templates-modal__field">
                    <span className="templates-modal__label">Summary instructions</span>
                    <div className="templates-modal__value templates-modal__value--multiline">
                      {selectedTemplate.body || "No summary provided."}
                    </div>
                  </div>
                  <div className="templates-modal__field templates-modal__field--grid">
                    <div>
                      <span className="templates-modal__label">Kind</span>
                      <p className="templates-modal__value">{formatKind(selectedTemplate.kind)}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
