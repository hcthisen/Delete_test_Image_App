import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceSummary = {
  id: string;
  name: string;
};

export type WorkspaceContextResolution = {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceSummary | null;
  status: "success" | "empty" | "error";
  message: string | null;
  shouldPersistSelection: boolean;
};

type WorkspaceMemberRow = {
  workspace_id: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string | null;
};

type ResolveWorkspaceContextParams = {
  supabase: SupabaseClient;
  userId: string;
  storedWorkspaceId: string | null;
  ownerWorkspaceId: string | null;
};

const EMPTY_MEMBERSHIP_MESSAGE = "We couldn’t find any workspaces linked to this account yet.";
const MISSING_DETAILS_MESSAGE = "We couldn’t load workspace details just yet.";

export const resolveWorkspaceContext = async ({
  supabase,
  userId,
  storedWorkspaceId,
  ownerWorkspaceId,
}: ResolveWorkspaceContextParams): Promise<WorkspaceContextResolution> => {
  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId);

  if (membershipError) {
    return {
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspace: null,
      status: "error",
      message: membershipError.message,
      shouldPersistSelection: false,
    };
  }

  const workspaceIds = (memberships ?? [])
    .map((membership: WorkspaceMemberRow) => membership.workspace_id)
    .filter((id): id is string => Boolean(id));

  if (workspaceIds.length === 0) {
    return {
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspace: null,
      status: "empty",
      message: EMPTY_MEMBERSHIP_MESSAGE,
      shouldPersistSelection: storedWorkspaceId !== null,
    };
  }

  const { data: workspaceRows, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name")
    .in("id", workspaceIds);

  if (workspaceError) {
    return {
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspace: null,
      status: "error",
      message: workspaceError.message,
      shouldPersistSelection: false,
    };
  }

  if (!workspaceRows || workspaceRows.length === 0) {
    return {
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspace: null,
      status: "empty",
      message: MISSING_DETAILS_MESSAGE,
      shouldPersistSelection: storedWorkspaceId !== null,
    };
  }

  const workspaceMap = new Map<string, string>(
    (workspaceRows as WorkspaceRow[]).map((row) => [row.id, row.name ?? "Untitled workspace"]),
  );

  const summaries = workspaceIds
    .map((id) => {
      const name = workspaceMap.get(id);
      return name ? { id, name } : null;
    })
    .filter((workspace): workspace is WorkspaceSummary => workspace !== null);

  if (summaries.length === 0) {
    return {
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspace: null,
      status: "empty",
      message: MISSING_DETAILS_MESSAGE,
      shouldPersistSelection: storedWorkspaceId !== null,
    };
  }

  const validIds = new Set(summaries.map((workspace) => workspace.id));
  let activeWorkspaceId: string | null = null;
  let shouldPersistSelection = false;

  if (storedWorkspaceId && validIds.has(storedWorkspaceId)) {
    activeWorkspaceId = storedWorkspaceId;
  } else {
    const coreWorkspaceId = ownerWorkspaceId && validIds.has(ownerWorkspaceId) ? ownerWorkspaceId : null;
    const fallbackWorkspaceId = coreWorkspaceId ?? summaries[0]?.id ?? null;

    activeWorkspaceId = fallbackWorkspaceId;
    shouldPersistSelection = storedWorkspaceId !== activeWorkspaceId;
  }

  if (storedWorkspaceId && !validIds.has(storedWorkspaceId)) {
    shouldPersistSelection = true;
  }

  const activeWorkspace =
    activeWorkspaceId !== null
      ? summaries.find((workspace) => workspace.id === activeWorkspaceId) ?? null
      : null;

  return {
    workspaces: summaries,
    activeWorkspaceId,
    activeWorkspace,
    status: "success",
    message: null,
    shouldPersistSelection,
  };
};
