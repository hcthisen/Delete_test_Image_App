// Dashboard experience showing workspace context, journal listings, and account controls.
"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveWorkspaceContext, type WorkspaceSummary } from "@/lib/workspaces";
import {
  JOURNAL_AUDIO_DELETE_WEBHOOK_URL,
  RESUMMARIZATION_WEBHOOK_URL,
  TRANSCRIPTION_SUMMARY_WEBHOOK_URL,
} from "@/lib/webhooks";

type AnyPostgrestFilterBuilder = PostgrestFilterBuilder<any, any, any, any>;

type Profile = {
  full_name: string | null;
  current_workspace: string | null;
  default_template_id: string | null;
  default_language_code: string | null;
};

type JournalRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  created_by_email: string | null;
  status: string;
  language_code: string | null;
  template_id: string | null;
  audio_path: string | null;
  meta: Record<string, unknown> | null;
};

type JournalDetails = JournalRow & {
  summary: string | null;
  transcript: string | null;
};

type DashboardMessage = {
  tone: "error" | "info";
  text: string;
};

type TemplateOption = {
  id: string;
  name: string | null;
};

type LanguageOption = {
  code: string;
  label: string | null;
};

type StatusOption = {
  label: string;
  values: string[];
};

type RecordingSource = "browser_media_recorder" | "file_upload";

type ResolvedAudioUpload = {
  extension: string;
  mimeType: string;
  originalMimeType: string | null;
};

const PAGE_SIZE = 10;

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

const EXTENSION_TO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  webm: "audio/webm",
};

const MIME_TYPE_TO_EXTENSION = new Map<string, string>([
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/x-mp3", "mp3"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/wave", "wav"],
  ["audio/x-pn-wav", "wav"],
  ["audio/mp4", "m4a"],
  ["audio/m4a", "m4a"],
  ["audio/x-m4a", "m4a"],
  ["audio/webm", "webm"],
]);

const ACCEPTED_EXTENSIONS = new Set(Object.keys(EXTENSION_TO_MIME));

const decodeJournalText = (value: string): string => {
  if (!value) {
    return value;
  }

  let decoded = value;
  for (let index = 0; index < 5; index += 1) {
    const hasUrlEncoding = /%(?:[0-9A-Fa-f]{2})/.test(decoded) || decoded.includes("+");

    if (!hasUrlEncoding) {
      break;
    }

    try {
      const next = decodeURIComponent(decoded.replace(/\+/g, "%20"));

      if (next === decoded) {
        break;
      }

      decoded = next;
    } catch (error) {
      const normalized = decoded.replace(/\+/g, "%20");
      const parts = normalized.split(/(%[0-9A-Fa-f]{2})/g);
      const rebuilt = parts
        .map((part) => {
          if (!part) {
            return "";
          }

          if (/^%[0-9A-Fa-f]{2}$/.test(part)) {
            try {
              return decodeURIComponent(part);
            } catch {
              console.warn("Failed to decode journal text segment.", part, error);
              return "";
            }
          }

          if (part.startsWith("%")) {
            console.warn("Stripping malformed journal text encoding.", part, error);
            return "";
          }

          return part;
        })
        .join("");

      if (rebuilt === decoded) {
        break;
      }

      decoded = rebuilt;
    }
  }

  if (decoded.includes("\\")) {
    decoded = decoded
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n");
  }

  return decoded;
};

const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continue to fallback.
    }
  }

  if (typeof document === "undefined" || !document.body) {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

  try {
    textarea.focus({ preventScroll: true });
  } catch {
    textarea.focus();
  }

  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let succeeded = false;

  try {
    succeeded = document.execCommand("copy");
  } catch {
    succeeded = false;
  }

  document.body.removeChild(textarea);

  if (selection) {
    selection.removeAllRanges();
    if (originalRange) {
      selection.addRange(originalRange);
    }
  }

  return succeeded;
};

const resolveUploadedAudio = (file: File): ResolvedAudioUpload | null => {
  const providedType = typeof file.type === "string" ? file.type : "";
  const extensionFromType = providedType ? MIME_TYPE_TO_EXTENSION.get(providedType) : undefined;
  const rawName = typeof file.name === "string" ? file.name : "";
  const extensionFromName = rawName.includes(".")
    ? rawName.slice(rawName.lastIndexOf(".") + 1).toLowerCase()
    : "";

  if (extensionFromType && ACCEPTED_EXTENSIONS.has(extensionFromType)) {
    const canonicalMime = EXTENSION_TO_MIME[extensionFromType];
    return {
      extension: extensionFromType,
      mimeType: canonicalMime,
      originalMimeType: providedType || null,
    };
  }

  if (extensionFromName && ACCEPTED_EXTENSIONS.has(extensionFromName)) {
    const canonicalMime = EXTENSION_TO_MIME[extensionFromName];
    return {
      extension: extensionFromName,
      mimeType: canonicalMime,
      originalMimeType:
        providedType && MIME_TYPE_TO_EXTENSION.get(providedType) === extensionFromName
          ? providedType
          : null,
    };
  }

  return null;
};

const getStatusClassName = (status: string) => {
  const normalised = typeof status === "string" ? status.toLowerCase() : "";
  switch (normalised) {
    case "done":
    case "processed":
      return "status-pill status-pill--done";
    case "processing":
    case "draft":
      return "status-pill status-pill--processing";
    case "error":
      return "status-pill status-pill--error";
    default:
      return "status-pill";
  }
};

const capitalise = (value: string) => {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const formatStatusLabel = (status: string) => {
  const normalised = typeof status === "string" ? status.toLowerCase() : "";
  switch (normalised) {
    case "done":
    case "processed":
      return "Done";
    case "processing":
    case "draft":
      return "Processing";
    case "error":
      return "Error";
    default:
      return capitalise(status);
  }
};

const parseDuration = (meta: JournalRow["meta"]) => {
  if (!meta || typeof meta !== "object") {
    return null;
  }

  const raw = (meta as { duration_sec?: unknown }).duration_sec;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const formatDuration = (durationSec: number | null) => {
  if (durationSec === null || Number.isNaN(durationSec)) {
    return "—";
  }

  if (durationSec < 60) {
    return `${Math.round(durationSec)}s`;
  }

  const totalMinutes = Math.floor(durationSec / 60);
  const seconds = Math.round(durationSec % 60);

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const hoursLabel = `${hours}h`;
    const minutesLabel = minutes > 0 ? ` ${minutes}m` : "";
    const secondsLabel = seconds > 0 ? ` ${seconds}s` : "";

    return `${hoursLabel}${minutesLabel}${secondsLabel}`.trim();
  }

  const minutesLabel = `${totalMinutes}m`;
  const secondsLabel = seconds > 0 ? ` ${seconds}s` : "";

  return `${minutesLabel}${secondsLabel}`.trim();
};

const PROCESSING_RATE_DIVISOR = 8.5;
const DEFAULT_PROCESSING_SECONDS = 70;
const MIN_PROCESSING_SECONDS = 20;
const PROGRESS_REFRESH_INTERVAL_MS = 500;
const MAX_VISUAL_PROGRESS = 0.98;
const MIN_VISUAL_PROGRESS = 0.06;
const PROCESSING_REFRESH_INITIAL_DELAY_MS = 20000;
const PROCESSING_REFRESH_SLOW_DELAY_MS = 18000;
const PROCESSING_REFRESH_MEDIUM_DELAY_MS = 15000;
const PROCESSING_REFRESH_FAST_DELAY_MS = 10000;
const PROCESSING_REFRESH_MAX_ATTEMPTS = 5;

const getEstimatedProcessingSeconds = (durationSeconds: number | null) => {
  if (durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return Math.max(MIN_PROCESSING_SECONDS, durationSeconds / PROCESSING_RATE_DIVISOR);
  }

  return DEFAULT_PROCESSING_SECONDS;
};

const getJournalProcessingProgress = (journal: JournalRow) => {
  const updatedAtMs = Date.parse(journal.updated_at);

  if (Number.isNaN(updatedAtMs)) {
    return 0;
  }

  const durationSeconds = parseDuration(journal.meta);
  const estimatedSeconds = getEstimatedProcessingSeconds(durationSeconds);
  const elapsedSeconds = Math.max(0, (Date.now() - updatedAtMs) / 1000);

  return Math.max(0, elapsedSeconds / estimatedSeconds);
};

const determineProcessingRefreshDelay = (progress: number, attempt: number) => {
  if (progress >= 0.9) {
    return PROCESSING_REFRESH_FAST_DELAY_MS;
  }

  if (progress >= 0.75) {
    return PROCESSING_REFRESH_MEDIUM_DELAY_MS;
  }

  if (progress >= 0.5) {
    return PROCESSING_REFRESH_SLOW_DELAY_MS;
  }

  return attempt === 0 ? PROCESSING_REFRESH_INITIAL_DELAY_MS : PROCESSING_REFRESH_SLOW_DELAY_MS;
};

type ProcessingStatusIndicatorProps = {
  statusClassName: string;
  updatedAt: string;
  durationSeconds: number | null;
};

const ProcessingStatusIndicator = ({
  statusClassName,
  updatedAt,
  durationSeconds,
}: ProcessingStatusIndicatorProps) => {
  const parsedUpdatedAt = useMemo(() => {
    const timestamp = Date.parse(updatedAt);
    return Number.isNaN(timestamp) ? null : timestamp;
  }, [updatedAt]);

  const estimatedSeconds = useMemo(
    () => getEstimatedProcessingSeconds(durationSeconds),
    [durationSeconds],
  );

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!parsedUpdatedAt) {
      return undefined;
    }

    setNow(Date.now());

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, PROGRESS_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [parsedUpdatedAt]);

  if (!parsedUpdatedAt) {
    return <span className={statusClassName}>Processing</span>;
  }

  const elapsedSeconds = Math.max(0, (now - parsedUpdatedAt) / 1000);
  const actualProgressRatio = Math.max(0, elapsedSeconds / estimatedSeconds);
  const visualProgressRatio = Math.min(
    MAX_VISUAL_PROGRESS,
    Math.max(MIN_VISUAL_PROGRESS, actualProgressRatio),
  );
  const visualProgressPercent = Math.round(visualProgressRatio * 100);
  const announcedProgressPercent = Math.min(100, Math.round(actualProgressRatio * 100));

  return (
    <div className="dashboard-status-progress">
      <span className={statusClassName}>Processing</span>
      <div
        className="dashboard-status-progress__bar"
        role="progressbar"
        aria-label="Processing journal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={announcedProgressPercent}
      >
        <div
          className="dashboard-status-progress__fill"
          style={{ width: `${visualProgressPercent}%` }}
        />
      </div>
    </div>
  );
};

const formatDateTime = (value: string) => {
  try {
    const date = new Date(value);

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch (error) {
    return value;
  }
};

const formatElapsedTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }

  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  const minutesLabel = minutes.toString().padStart(2, "0");
  const secondsLabel = remainingSeconds.toString().padStart(2, "0");

  return `${minutesLabel}:${secondsLabel}`;
};

export default function DashboardPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [journals, setJournals] = useState<JournalRow[]>([]);
  const [templateNames, setTemplateNames] = useState<Record<string, string>>({});
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [isLoadingJournals, setIsLoadingJournals] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [message, setMessage] = useState<DashboardMessage | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<"today" | "7d" | "30d" | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const isComponentMountedRef = useRef(true);
  const journalsRequestIdRef = useRef(0);
  const processingRefreshStateRef = useRef<{
    timeoutId: number | null;
    attempts: number;
    processingKey: string | null;
  }>({
    timeoutId: null,
    attempts: 0,
    processingKey: null,
  });
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "stopped">("idle");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingIntervalRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingMimeTypeRef = useRef<string>("audio/webm");
  const recordingDeviceLabelRef = useRef<string | null>(null);
  const recordingPreviewUrlRef = useRef<string | null>(null);
  const recordingBlobRef = useRef<Blob | null>(null);
  const recordingSourceRef = useRef<RecordingSource>("browser_media_recorder");
  const recordingFileExtensionRef = useRef<string>("webm");
  const recordingFileNameRef = useRef<string | null>(null);
  const recordingOriginalMimeTypeRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState<string | null>(null);
  const [isRequestingMicrophone, setIsRequestingMicrophone] = useState(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false);
  const [isSavingRecording, setIsSavingRecording] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveForm, setSaveForm] = useState({ templateId: "", languageCode: "" });
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [languageOptions, setLanguageOptions] = useState<LanguageOption[]>([]);
  const [isLoadingLanguages, setIsLoadingLanguages] = useState(false);
  const [languagesError, setLanguagesError] = useState<string | null>(null);
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);
  const [journalDetailsCache, setJournalDetailsCache] = useState<Record<string, JournalDetails>>({});
  const [isLoadingJournalDetails, setIsLoadingJournalDetails] = useState(false);
  const [journalDetailsError, setJournalDetailsError] = useState<string | null>(null);
  const [journalForm, setJournalForm] = useState({ templateId: "", languageCode: "" });
  const [isResummarizing, setIsResummarizing] = useState(false);
  const [resummarizeStatus, setResummarizeStatus] = useState<"idle" | "success" | "error">("idle");
  const [resummarizeMessage, setResummarizeMessage] = useState<string | null>(null);
  const [isDeletingJournal, setIsDeletingJournal] = useState(false);
  const [copyStatus, setCopyStatus] = useState<{
    summary: "idle" | "copied" | "error";
    transcript: "idle" | "copied" | "error";
  }>({ summary: "idle", transcript: "idle" });
  const [audioPlaybackUrl, setAudioPlaybackUrl] = useState<string | null>(null);
  const [isLoadingAudioUrl, setIsLoadingAudioUrl] = useState(false);
  const [audioUrlError, setAudioUrlError] = useState<string | null>(null);
  const saveModalRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const journalModalRef = useRef<HTMLDivElement | null>(null);
  const journalLastFocusedElementRef = useRef<HTMLElement | null>(null);
  const journalFormJournalIdRef = useRef<string | null>(null);
  type CopyTimeoutHandle = ReturnType<typeof setTimeout>;

  const copyTimeoutRef = useRef<{
    summary: CopyTimeoutHandle | null;
    transcript: CopyTimeoutHandle | null;
  }>({ summary: null, transcript: null });
  const summaryContentRef = useRef<HTMLParagraphElement | null>(null);
  const transcriptContentRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    return () => {
      isComponentMountedRef.current = false;
      const state = processingRefreshStateRef.current;

      if (state.timeoutId !== null) {
        window.clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }
    };
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);

    return () => {
      clearTimeout(handle);
    };
  }, [searchTerm]);

  const clearCopyTimeout = useCallback((type: "summary" | "transcript") => {
    const handle = copyTimeoutRef.current[type];

    if (handle) {
      clearTimeout(handle);
      copyTimeoutRef.current[type] = null;
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadContext = async () => {
      setMessage(null);
      setIsLoadingContext(true);

      try {
        const {
          data: { user: supabaseUser },
          error: authError,
        } = await supabase.auth.getUser();

        if (!isActive) return;

        if (authError) {
          setMessage({ tone: "error", text: authError.message });
          return;
        }

        if (!supabaseUser) {
          router.push("/login");
          return;
        }

        setUser(supabaseUser);

        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, current_workspace, default_template_id, default_language_code")
          .eq("id", supabaseUser.id)
          .maybeSingle();

        if (!isActive) return;

        if (profileError) {
          setMessage({ tone: "error", text: profileError.message });
        }

        setProfile(profileRow ?? null);

        const context = await resolveWorkspaceContext({
          supabase,
          userId: supabaseUser.id,
          ownerWorkspaceId: supabaseUser.id,
          storedWorkspaceId: profileRow?.current_workspace ?? null,
        });

        if (!isActive) return;

        setWorkspaces(context.workspaces);
        setCurrentWorkspaceId((previousId) => {
          const nextId = context.activeWorkspaceId;
          if (nextId && previousId !== nextId) {
            setPage(1);
          }
          return nextId;
        });

        if (context.status === "error" && context.message) {
          setMessage({ tone: "error", text: context.message });
        } else if (context.status === "empty" && context.message) {
          setMessage({ tone: "info", text: context.message });
        } else {
          setMessage(null);
        }

        if (context.shouldPersistSelection) {
          const { error: persistError } = await supabase
            .from("profiles")
            .update({ current_workspace: context.activeWorkspaceId })
            .eq("id", supabaseUser.id);

          if (!isActive) return;

          if (persistError) {
            setMessage({ tone: "error", text: persistError.message });
          } else {
            setProfile((previous) =>
              previous ? { ...previous, current_workspace: context.activeWorkspaceId } : previous,
            );
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
    if (!isMenuOpen) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const menuElement = menuRef.current;
      const buttonElement = menuButtonRef.current;

      if (
        menuElement &&
        !menuElement.contains(target) &&
        buttonElement &&
        !buttonElement.contains(target)
      ) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isFilterOpen) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const filtersElement = filtersRef.current;

      if (filtersElement && !filtersElement.contains(target)) {
        setIsFilterOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFilterOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFilterOpen]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilters, dateFilter, sortOrder]);

  const loadJournals = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!isComponentMountedRef.current) {
        return;
      }

      if (!currentWorkspaceId) {
        journalsRequestIdRef.current += 1;
        setJournals([]);
        setTotalPages(1);
        setTotalCount(0);
        setIsLoadingJournals(false);
        return;
      }

      const requestId = journalsRequestIdRef.current + 1;
      journalsRequestIdRef.current = requestId;

      if (!options?.silent) {
        setIsLoadingJournals(true);
      }

      setMessage((existing) => (existing?.tone === "error" ? null : existing));

      const pageStart = (page - 1) * PAGE_SIZE;
      const pageEnd = pageStart + PAGE_SIZE - 1;

      const startDateIso = (() => {
        if (!dateFilter) {
          return null;
        }

        const start = new Date();

        if (dateFilter === "today") {
          start.setHours(0, 0, 0, 0);
        } else {
          const days = dateFilter === "7d" ? 7 : 30;
          start.setDate(start.getDate() - days);
        }

        return start.toISOString();
      })();

      const applyFilters = <T extends AnyPostgrestFilterBuilder>(query: T): T => {
        let next: AnyPostgrestFilterBuilder = query.eq(
          "workspace_id",
          currentWorkspaceId
        );

        if (statusFilters.length > 0) {
          next = next.in("status", statusFilters);
        }

        if (startDateIso) {
          next = next.gte("created_at", startDateIso);
        }

        if (debouncedSearch) {
          const escaped = debouncedSearch
            .replace(/[%_]/g, "\\$&")
            .replace(/[,()]/g, (match) => `\\${match}`);
          const pattern = `%${escaped}%`;
          next = next.or(
            `summary.ilike.${pattern},transcript.ilike.${pattern},audio_path.ilike.${pattern}`
          );
        }

        return next as T;
      };

      const journalsQuery = applyFilters(
        supabase
          .from("journals")
          .select(
            "id, created_at, updated_at, created_by, created_by_email, status, language_code, template_id, audio_path, meta",
          )
      )
        .order("created_at", { ascending: sortOrder === "asc" })
        .range(pageStart, pageEnd);

      const countQuery = applyFilters(
        supabase.from("journals").select("id", { count: "exact", head: true })
      );

      const [journalResult, countResult] = await Promise.all([journalsQuery, countQuery]);

      const isLatestRequest = () =>
        isComponentMountedRef.current && journalsRequestIdRef.current === requestId;

      if (!isLatestRequest()) {
        return;
      }

      if (journalResult.error) {
        if (journalResult.error.message.toLowerCase().includes("stack depth limit exceeded")) {
          setMessage({
            tone: "info",
            text: "We’re still setting up your workspace. Journals will appear here once you’ve created your first one.",
          });
        } else {
          setMessage({ tone: "error", text: journalResult.error.message });
        }
        setJournals([]);
        setTotalPages(1);
        setTotalCount(0);
        setIsLoadingJournals(false);
        return;
      }

      if (countResult.error) {
        setMessage({ tone: "error", text: countResult.error.message });
        setJournals([]);
        setTotalPages(1);
        setTotalCount(0);
        setIsLoadingJournals(false);
        return;
      }

      const data = journalResult.data ?? [];
      const count = countResult.count ?? 0;

      setJournals(data);
      setTotalCount(count);

      const nextTotalPages = count > 0 ? Math.ceil(count / PAGE_SIZE) : 1;
      setTotalPages(nextTotalPages);

      if (page > nextTotalPages) {
        setPage(nextTotalPages);
        setIsLoadingJournals(false);
        return;
      }

      const templateIds = Array.from(
        new Set(
          data
            .map((row) => row.template_id)
            .filter((templateId): templateId is string => Boolean(templateId))
        )
      );

      if (templateIds.length > 0) {
        const { data: templateRows, error: templateError } = await supabase
          .from("templates")
          .select("id, name")
          .in("id", templateIds);

        if (!isLatestRequest()) {
          return;
        }

        if (templateError) {
          setMessage({ tone: "error", text: templateError.message });
        } else if (templateRows) {
          setTemplateNames((previous) => {
            const next = { ...previous };
            for (const template of templateRows) {
              next[template.id] = template.name ?? "Untitled template";
            }
            return next;
          });
        }
      }

      if (!isLatestRequest()) {
        return;
      }

      setIsLoadingJournals(false);
    },
    [
      currentWorkspaceId,
      dateFilter,
      debouncedSearch,
      page,
      sortOrder,
      statusFilters,
      supabase,
    ],
  );

  useEffect(() => {
    void loadJournals();
  }, [loadJournals]);

  useEffect(() => {
    const state = processingRefreshStateRef.current;

    if (!currentWorkspaceId) {
      if (state.timeoutId !== null) {
        window.clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }
      state.attempts = 0;
      state.processingKey = null;
      return;
    }

    const processingJournals = journals.filter(
      (journal) => journal.status?.toLowerCase() === "processing",
    );

    if (processingJournals.length === 0) {
      if (state.timeoutId !== null) {
        window.clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }
      state.attempts = 0;
      state.processingKey = null;
      return;
    }

    const processingKey = `${currentWorkspaceId}:${processingJournals
      .map((journal) => journal.id)
      .sort()
      .join(",")}`;

    if (state.processingKey !== processingKey) {
      if (state.timeoutId !== null) {
        window.clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }
      state.processingKey = processingKey;
      state.attempts = 0;
    }

    if (state.timeoutId !== null) {
      return;
    }

    if (state.attempts >= PROCESSING_REFRESH_MAX_ATTEMPTS) {
      return;
    }

    const highestProgress = processingJournals.reduce((maximum, journal) => {
      const progress = Math.min(1, getJournalProcessingProgress(journal));
      return progress > maximum ? progress : maximum;
    }, 0);

    const delay = determineProcessingRefreshDelay(highestProgress, state.attempts);

    state.attempts += 1;
    state.timeoutId = window.setTimeout(() => {
      state.timeoutId = null;
      void loadJournals({ silent: true });
    }, delay);
  }, [currentWorkspaceId, journals, loadJournals]);

  const displayName = profile?.full_name?.trim() ? profile.full_name.trim() : user?.email ?? "Account";
  const activeWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId);
  const workspaceTitle = isLoadingContext ? "Loading workspace…" : activeWorkspace?.name ?? "No workspace yet";

  const handleWorkspaceChange = async (workspaceId: string) => {
    setIsMenuOpen(false);

    if (workspaceId === currentWorkspaceId) {
      return;
    }

    const previousWorkspaceId = currentWorkspaceId;
    const previousPage = page;

    setCurrentWorkspaceId(workspaceId);
    setPage(1);

    if (!user) {
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ current_workspace: workspaceId })
      .eq("id", user.id);

    if (error) {
      setMessage({ tone: "error", text: error.message });
      setCurrentWorkspaceId(previousWorkspaceId ?? null);
      setPage(previousPage);
      return;
    }

    setProfile((previous) => (previous ? { ...previous, current_workspace: workspaceId } : previous));
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setMessage(null);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage({ tone: "error", text: error.message });
      setIsSigningOut(false);
      return;
    }

    router.push("/login");
  };

  const stopRecordingTimer = () => {
    if (recordingIntervalRef.current !== null) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  };

  const releaseMediaStream = () => {
    const stream = mediaStreamRef.current;
    if (!stream) {
      return;
    }

    for (const track of stream.getTracks()) {
      track.stop();
    }

    mediaStreamRef.current = null;
  };

  const resetRecordingState = () => {
    stopRecordingTimer();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (error) {
        // Ignore stop errors during reset.
      }
    }

    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    recordingDeviceLabelRef.current = null;
    recordingSourceRef.current = "browser_media_recorder";
    recordingFileExtensionRef.current = "webm";
    recordingFileNameRef.current = null;
    recordingMimeTypeRef.current = "audio/webm";
    recordingOriginalMimeTypeRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setRecordingBlob(null);
    setRecordingPreviewUrl(null);
    setRecordingDuration(0);
    setRecordingState("idle");
    setIsProcessingRecording(false);
    setIsSaveModalOpen(false);
    releaseMediaStream();
  };

  const handleUploadAudioClick = () => {
    if (
      recordingState === "recording" ||
      isRequestingMicrophone ||
      isProcessingRecording ||
      isSavingRecording
    ) {
      return;
    }

    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleAudioFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const selectedFile = input.files && input.files.length > 0 ? input.files[0] : null;

    // Reset the input so selecting the same file twice still triggers the change event.
    input.value = "";

    if (!selectedFile) {
      return;
    }

    if (isRequestingMicrophone || isProcessingRecording || isSavingRecording) {
      return;
    }

    if (recordingState === "recording") {
      setMessage({ tone: "error", text: "Stop the current recording before uploading audio." });
      return;
    }

    if (selectedFile.size > MAX_UPLOAD_BYTES) {
      setMessage({ tone: "error", text: "Audio files must be 200 MB or smaller." });
      return;
    }

    const resolved = resolveUploadedAudio(selectedFile);
    if (!resolved) {
      setMessage({ tone: "error", text: "Unsupported audio format. Upload an MP3, WAV, M4A, or WebM file." });
      return;
    }

    resetRecordingState();

    const previewUrl = URL.createObjectURL(selectedFile);
    recordingSourceRef.current = "file_upload";
    recordingMimeTypeRef.current = resolved.mimeType;
    recordingFileExtensionRef.current = resolved.extension;
    recordingFileNameRef.current = selectedFile.name;
    recordingOriginalMimeTypeRef.current = resolved.originalMimeType;
    recordingDeviceLabelRef.current = null;
    setRecordingBlob(selectedFile);
    setRecordingPreviewUrl(previewUrl);
    setRecordingState("stopped");
    setIsProcessingRecording(false);
    if (message?.tone === "error") {
      setMessage(null);
    }

    if (typeof window === "undefined") {
      return;
    }

    try {
      const audioElement = document.createElement("audio");
      audioElement.preload = "metadata";

      const handleLoadedMetadata = () => {
        audioElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audioElement.removeEventListener("error", handleError);

        if (
          recordingPreviewUrlRef.current !== previewUrl ||
          recordingBlobRef.current !== selectedFile
        ) {
          return;
        }

        if (Number.isFinite(audioElement.duration) && audioElement.duration > 0) {
          setRecordingDuration(Math.round(audioElement.duration));
        } else {
          setRecordingDuration(0);
        }
      };

      const handleError = () => {
        audioElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audioElement.removeEventListener("error", handleError);
      };

      audioElement.addEventListener("loadedmetadata", handleLoadedMetadata);
      audioElement.addEventListener("error", handleError);
      audioElement.src = previewUrl;
      audioElement.load();
    } catch (error) {
      // Ignore metadata errors; the preview and saving flow will still work.
    }
  };

  const handleStartRecording = async () => {
    if (
      recordingState === "recording" ||
      isRequestingMicrophone ||
      isProcessingRecording ||
      isSavingRecording
    ) {
      return;
    }

    recordingSourceRef.current = "browser_media_recorder";
    recordingFileExtensionRef.current = "webm";
    recordingFileNameRef.current = null;
    recordingOriginalMimeTypeRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
      setMessage({ tone: "error", text: "Recording audio isn't supported in this browser." });
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMessage({ tone: "error", text: "Unable to access your microphone in this browser." });
      return;
    }

    try {
      setIsRequestingMicrophone(true);
      stopRecordingTimer();
      recordedChunksRef.current = [];
      recordingDeviceLabelRef.current = null;
      setRecordingBlob(null);
      setRecordingPreviewUrl(null);
      setRecordingDuration(0);
      setIsProcessingRecording(false);
      setIsSaveModalOpen(false);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioTracks = stream.getAudioTracks();
      recordingDeviceLabelRef.current = audioTracks.length > 0 ? audioTracks[0].label || null : null;

      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm"];
      const supportedMimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));

      if (!supportedMimeType) {
        releaseMediaStream();
        setMessage({ tone: "error", text: "Recording audio in WebM format isn't supported in this browser." });
        return;
      }

      recordingMimeTypeRef.current = "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
      mediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const chunks = recordedChunksRef.current;
        recordedChunksRef.current = [];

        const hasAudio = chunks.some((chunk) => chunk.size > 0);
        if (!hasAudio) {
          setRecordingBlob(null);
          setRecordingPreviewUrl(null);
          setIsProcessingRecording(false);
          setRecordingState("idle");
          mediaRecorderRef.current = null;
          recordingDeviceLabelRef.current = null;
          releaseMediaStream();
          return;
        }

        const blob = new Blob(chunks, { type: recordingMimeTypeRef.current });
        recordingSourceRef.current = "browser_media_recorder";
        recordingFileExtensionRef.current = "webm";
        recordingFileNameRef.current = null;
        recordingOriginalMimeTypeRef.current = null;
        setRecordingBlob(blob);
        setRecordingPreviewUrl(URL.createObjectURL(blob));
        setIsProcessingRecording(false);
        setRecordingState("stopped");
        mediaRecorderRef.current = null;
        releaseMediaStream();
      });

      recorder.addEventListener("error", (event) => {
        const errorEvent = event as Event & { error?: DOMException };
        const errorMessage = errorEvent?.error?.message ?? "Recording failed. Please try again.";
        recordedChunksRef.current = [];
        setRecordingBlob(null);
        setRecordingPreviewUrl(null);
        setIsProcessingRecording(false);
        setRecordingState("idle");
        mediaRecorderRef.current = null;
        recordingDeviceLabelRef.current = null;
        recordingOriginalMimeTypeRef.current = null;
        releaseMediaStream();
        setMessage({ tone: "error", text: errorMessage });
      });

      recorder.start();
      setRecordingState("recording");
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingDuration((previous) => previous + 1);
      }, 1000);
    } catch (error) {
      releaseMediaStream();
      recordedChunksRef.current = [];
      recordingDeviceLabelRef.current = null;
      setRecordingBlob(null);
      setRecordingPreviewUrl(null);
      setRecordingState("idle");
      setIsProcessingRecording(false);
      recordingOriginalMimeTypeRef.current = null;

      const messageText =
        error instanceof Error && error.message ? error.message : "Unable to access your microphone.";
      setMessage({ tone: "error", text: messageText });
    } finally {
      setIsRequestingMicrophone(false);
    }
  };

  const handleStopRecording = () => {
    if (recordingState !== "recording") {
      return;
    }

    setIsProcessingRecording(true);
    stopRecordingTimer();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      try {
        recorder.stop();
      } catch (error) {
        setIsProcessingRecording(false);
        mediaRecorderRef.current = null;
        releaseMediaStream();
        recordedChunksRef.current = [];
        recordingDeviceLabelRef.current = null;
        const messageText =
          error instanceof Error && error.message ? error.message : "Failed to stop the recording.";
        setMessage({ tone: "error", text: messageText });
        setRecordingState("idle");
        return;
      }
    } else {
      setIsProcessingRecording(false);
    }

    setRecordingState("stopped");
  };

  const handleResetRecording = () => {
    resetRecordingState();
  };

  const handleOpenSaveModal = () => {
    if (!recordingBlob || isProcessingRecording) {
      setMessage({ tone: "error", text: "Record audio and stop the recording before saving." });
      return;
    }

    setTemplatesError(null);
    setLanguagesError(null);
    setSaveForm({
      templateId: profile?.default_template_id ?? "",
      languageCode: profile?.default_language_code ?? "",
    });
    setIsSaveModalOpen(true);
  };

  const handleCloseSaveModal = useCallback(() => {
    if (isSavingRecording) {
      return;
    }
    setIsSaveModalOpen(false);
  }, [isSavingRecording]);

  const handleSaveRecording = async () => {
    if (!recordingBlob) {
      setMessage({ tone: "error", text: "There’s no recording to save yet." });
      return;
    }

    if (!currentWorkspaceId) {
      setMessage({ tone: "error", text: "Select a workspace before saving your recording." });
      return;
    }

    if (!user) {
      setMessage({ tone: "error", text: "You need to be signed in to save recordings." });
      return;
    }

    setIsSavingRecording(true);

    const languageCode = saveForm.languageCode ? saveForm.languageCode : null;
    const templateId = saveForm.templateId ? saveForm.templateId : null;
    const durationSeconds = Number.isFinite(recordingDuration) ? Number(recordingDuration) : null;
    const fileId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 12);
    const extension = recordingFileExtensionRef.current;
    const normalisedExtension = ACCEPTED_EXTENSIONS.has(extension) ? extension : "webm";
    const storageKey = `${currentWorkspaceId}/${fileId}.${normalisedExtension}`;
    const storagePath = `audio/${storageKey}`;

    const meta: Record<string, unknown> = {
      duration_sec: durationSeconds,
      mime_type: recordingMimeTypeRef.current,
      size_bytes: recordingBlob.size,
      source: recordingSourceRef.current,
    };

    if (recordingDeviceLabelRef.current) {
      meta.device_label = recordingDeviceLabelRef.current;
    }

    if (recordingSourceRef.current === "file_upload" && recordingFileNameRef.current) {
      meta.original_file_name = recordingFileNameRef.current;
    }

    if (
      recordingOriginalMimeTypeRef.current &&
      recordingOriginalMimeTypeRef.current !== recordingMimeTypeRef.current
    ) {
      meta.original_mime_type = recordingOriginalMimeTypeRef.current;
    }

    let journalCreated = false;

    try {
      const { error: uploadError } = await supabase.storage
        .from("audio")
        .upload(storageKey, recordingBlob, {
          contentType: recordingMimeTypeRef.current,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: insertedRow, error: insertError } = await supabase
        .from("journals")
        .insert({
          workspace_id: currentWorkspaceId,
          created_by: user.id,
          status: "processing",
          language_code: languageCode,
          template_id: templateId,
          audio_path: storagePath,
          meta,
        })
        .select(
          "id, created_at, updated_at, created_by, created_by_email, status, language_code, template_id, audio_path, meta",
        )
        .single();

      if (insertError || !insertedRow) {
        throw new Error(insertError?.message ?? "Failed to create journal entry.");
      }

      journalCreated = true;

      let automationResponse: Response;
      try {
        automationResponse = await fetch(TRANSCRIPTION_SUMMARY_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ journal_id: insertedRow.id }),
        });
      } catch (networkError) {
        const message =
          networkError instanceof Error && networkError.message
            ? `Failed to trigger journal processing: ${networkError.message}`
            : "Failed to trigger journal processing. Please try again.";
        throw new Error(message);
      }

      if (!automationResponse.ok) {
        let errorDetail: string | null = null;
        try {
          errorDetail = await automationResponse.text();
        } catch (readError) {
          errorDetail = readError instanceof Error ? readError.message : null;
        }

        const trimmedDetail = errorDetail?.trim();
        throw new Error(
          trimmedDetail && trimmedDetail.length > 0
            ? `Failed to trigger journal processing: ${trimmedDetail}`
            : "Failed to trigger journal processing. Please try again.",
        );
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          default_language_code: languageCode,
          default_template_id: templateId,
        })
        .eq("id", user.id);

      const isDescendingNewest = sortOrder === "desc";
      const isOnFirstPage = page === 1;

      if (isDescendingNewest && isOnFirstPage) {
        setJournals((previous) => {
          const next = [insertedRow, ...previous];
          if (next.length > PAGE_SIZE) {
            next.pop();
          }
          return next;
        });
      }

      setTotalCount((previous) => {
        const nextCount = previous + 1;
        setTotalPages(nextCount > 0 ? Math.ceil(nextCount / PAGE_SIZE) : 1);
        return nextCount;
      });

      if (!isDescendingNewest) {
        setSortOrder("desc");
      }

      if (!isOnFirstPage) {
        setPage(1);
      }

      if (insertedRow.template_id) {
        setTemplateNames((previous) => {
          if (previous[insertedRow.template_id]) {
            return previous;
          }

          const option = templateOptions.find((template) => template.id === insertedRow.template_id);
          return {
            ...previous,
            [insertedRow.template_id]: option?.name ?? "Untitled template",
          };
        });
      }

      if (!profileError) {
        setProfile((previous) =>
          previous
            ? {
                ...previous,
                default_language_code: languageCode,
                default_template_id: templateId,
              }
            : previous,
        );
      }

      resetRecordingState();

      const successMessage = profileError
        ? `Recording saved and processing has started, but we couldn’t update your defaults: ${profileError.message}`
        : "Recording saved and processing has started.";
      const tone: DashboardMessage["tone"] = profileError ? "error" : "info";
      setMessage({ tone, text: successMessage });
    } catch (error) {
      if (!journalCreated) {
        await supabase.storage.from("audio").remove([storageKey]);
      }

      const messageText =
        error instanceof Error && error.message ? error.message : "Failed to save the recording.";
      setMessage({ tone: "error", text: messageText });
    } finally {
      setIsSavingRecording(false);
    }
  };

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current !== null) {
        window.clearInterval(recordingIntervalRef.current);
      }

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch (error) {
          // Ignore recorder stop errors during cleanup.
        }
      }

      const stream = mediaStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        mediaStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    recordingPreviewUrlRef.current = recordingPreviewUrl;
  }, [recordingPreviewUrl]);

  useEffect(() => {
    recordingBlobRef.current = recordingBlob;
  }, [recordingBlob]);

  useEffect(() => {
    return () => {
      if (recordingPreviewUrl) {
        URL.revokeObjectURL(recordingPreviewUrl);
      }
    };
  }, [recordingPreviewUrl]);

  useEffect(() => {
    if (!isSaveModalOpen && !isJournalModalOpen) {
      return undefined;
    }

    let isActive = true;

    const loadOptions = async () => {
      setIsLoadingTemplates(true);
      setTemplatesError(null);

      const { data: templateRows, error: templateError } = await supabase
        .from("templates")
        .select("id, name")
        .order("name", { ascending: true });

      if (!isActive) {
        return;
      }

      if (templateError) {
        setTemplatesError(templateError.message);
        setTemplateOptions([]);
      } else {
        setTemplateOptions(templateRows ?? []);
        if (isSaveModalOpen) {
          setSaveForm((previous) => {
            if (previous.templateId) {
              return previous;
            }

            const defaultTemplateId = profile?.default_template_id ?? "";
            if (defaultTemplateId && templateRows?.some((row) => row.id === defaultTemplateId)) {
              return { ...previous, templateId: defaultTemplateId };
            }

            const fallbackTemplateId = templateRows && templateRows.length > 0 ? templateRows[0].id : "";
            return { ...previous, templateId: fallbackTemplateId ?? "" };
          });
        }
      }

      setIsLoadingTemplates(false);

      setIsLoadingLanguages(true);
      setLanguagesError(null);

      const { data: languageRows, error: languageError } = await supabase
        .from("languages")
        .select("code, label")
        .order("label", { ascending: true });

      if (!isActive) {
        return;
      }

      if (languageError) {
        setLanguagesError(languageError.message);
        setLanguageOptions([]);
      } else {
        setLanguageOptions(languageRows ?? []);
        if (isSaveModalOpen) {
          setSaveForm((previous) => {
            if (previous.languageCode) {
              return previous;
            }

            const defaultLanguageCode = profile?.default_language_code ?? "";
            if (defaultLanguageCode && languageRows?.some((row) => row.code === defaultLanguageCode)) {
              return { ...previous, languageCode: defaultLanguageCode };
            }

            const fallbackLanguageCode = languageRows && languageRows.length > 0 ? languageRows[0].code : "";
            return { ...previous, languageCode: fallbackLanguageCode ?? "" };
          });
        }
      }

      setIsLoadingLanguages(false);
    };

    void loadOptions();

    return () => {
      isActive = false;
    };
  }, [isJournalModalOpen, isSaveModalOpen, profile, supabase]);

  useEffect(() => {
    if (!isSaveModalOpen) {
      return undefined;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    lastFocusedElementRef.current = previouslyFocused;

    const modalElement = saveModalRef.current;

    if (!modalElement) {
      return undefined;
    }

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusFirstElement = () => {
      const focusableElements = Array.from(
        modalElement.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else {
        modalElement.focus();
      }
    };

    focusFirstElement();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCloseSaveModal();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = Array.from(
        modalElement.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [handleCloseSaveModal, isSaveModalOpen]);

  const handleCloseJournalModal = useCallback(() => {
    setIsJournalModalOpen(false);
    setSelectedJournalId(null);
    setIsLoadingJournalDetails(false);
    setJournalDetailsError(null);
    setCopyStatus({ summary: "idle", transcript: "idle" });
    clearCopyTimeout("summary");
    clearCopyTimeout("transcript");
    setJournalForm({ templateId: "", languageCode: "" });
    journalFormJournalIdRef.current = null;
    setIsResummarizing(false);
    setResummarizeStatus("idle");
    setResummarizeMessage(null);
    setIsDeletingJournal(false);
  }, [clearCopyTimeout]);

  const handleOpenJournal = useCallback(
    (journalId: string) => {
      clearCopyTimeout("summary");
      clearCopyTimeout("transcript");
      setCopyStatus({ summary: "idle", transcript: "idle" });
      setJournalDetailsError(null);
      setSelectedJournalId(journalId);
      setIsJournalModalOpen(true);
      setIsLoadingJournalDetails(!journalDetailsCache[journalId]);
    },
    [clearCopyTimeout, journalDetailsCache],
  );

  const handleCopyContent = useCallback(
    async (
      type: "summary" | "transcript",
      value: string | null | undefined,
      options?: { sourceElement?: HTMLElement | null },
    ) => {
      const sourceText = options?.sourceElement?.textContent ?? null;
      const candidateFromSource = sourceText && sourceText.length > 0 ? sourceText : null;
      const fallbackText = typeof value === "string" ? value : "";
      const rawText = candidateFromSource ?? fallbackText;

      if (!rawText) {
        return;
      }

      clearCopyTimeout(type);

      const clipboardValue = decodeJournalText(rawText);
      const didCopy = await copyTextToClipboard(clipboardValue);

      setCopyStatus((previous) => ({ ...previous, [type]: didCopy ? "copied" : "error" }));

      copyTimeoutRef.current[type] = setTimeout(() => {
        setCopyStatus((previous) => ({ ...previous, [type]: "idle" }));
        copyTimeoutRef.current[type] = null;
      }, 2000);
    },
    [clearCopyTimeout],
  );

  useEffect(() => {
    if (!isJournalModalOpen || !selectedJournalId) {
      return;
    }

    const cached = journalDetailsCache[selectedJournalId];

    if (cached) {
      setIsLoadingJournalDetails(false);
      return;
    }

    let isActive = true;

    const loadDetails = async () => {
      setIsLoadingJournalDetails(true);
      setJournalDetailsError(null);

      const { data, error } = await supabase
        .from("journals")
        .select(
          "id, created_at, updated_at, created_by, created_by_email, status, language_code, template_id, audio_path, meta, summary, transcript",
        )
        .eq("id", selectedJournalId)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      if (error) {
        setJournalDetailsError(error.message);
        setIsLoadingJournalDetails(false);
        return;
      }

      if (!data) {
        setJournalDetailsError("Journal not found.");
        setIsLoadingJournalDetails(false);
        return;
      }

      const baseRow = journals.find((row) => row.id === selectedJournalId) ?? null;

      const merged: JournalDetails = {
        id: data.id,
        created_at: data.created_at ?? baseRow?.created_at ?? new Date().toISOString(),
        updated_at:
          data.updated_at ??
          baseRow?.updated_at ??
          data.created_at ??
          baseRow?.created_at ??
          new Date().toISOString(),
        created_by: data.created_by ?? baseRow?.created_by ?? null,
        created_by_email: (data.created_by_email as string | null | undefined) ?? baseRow?.created_by_email ?? null,
        status: data.status ?? baseRow?.status ?? "",
        language_code: data.language_code ?? baseRow?.language_code ?? null,
        template_id: data.template_id ?? baseRow?.template_id ?? null,
        audio_path:
          typeof data.audio_path === "string"
            ? data.audio_path
            : (data.audio_path as string | null | undefined) ?? baseRow?.audio_path ?? null,
        meta: (data.meta as JournalRow["meta"]) ?? baseRow?.meta ?? null,
        summary:
          typeof data.summary === "string"
            ? decodeJournalText(data.summary)
            : (data.summary as string | null | undefined) ?? null,
        transcript:
          typeof data.transcript === "string"
            ? decodeJournalText(data.transcript)
            : (data.transcript as string | null | undefined) ?? null,
      };

      setJournalDetailsCache((previous) => ({ ...previous, [data.id]: merged }));
      setIsLoadingJournalDetails(false);
    };

    void loadDetails();

    return () => {
      isActive = false;
    };
  }, [
    isJournalModalOpen,
    journalDetailsCache,
    journals,
    selectedJournalId,
    supabase,
  ]);

  useEffect(() => {
    if (!isJournalModalOpen) {
      return undefined;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    journalLastFocusedElementRef.current = previouslyFocused;

    const modalElement = journalModalRef.current;

    if (!modalElement) {
      return undefined;
    }

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusableElements = Array.from(
      modalElement.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    } else {
      modalElement.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCloseJournalModal();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(
        modalElement.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      const lastFocused = journalLastFocusedElementRef.current;
      if (!isSaveModalOpen && lastFocused && document.contains(lastFocused)) {
        lastFocused.focus();
      }
    };
  }, [handleCloseJournalModal, isJournalModalOpen, isSaveModalOpen]);

  useEffect(() => {
    return () => {
      clearCopyTimeout("summary");
      clearCopyTimeout("transcript");
    };
  }, [clearCopyTimeout]);

  const handleNextPage = () => {
    setPage((current) => Math.min(current + 1, totalPages));
  };

  const handlePreviousPage = () => {
    setPage((current) => Math.max(current - 1, 1));
  };

  const toggleStatusFilter = (option: StatusOption) => {
    setStatusFilters((current) => {
      const { values } = option;
      const hasAllValues = values.every((value) => current.includes(value));
      if (hasAllValues) {
        return current.filter((value) => !values.includes(value));
      }
      const remaining = current.filter((value) => !values.includes(value));
      return [...remaining, ...values];
    });
  };

  const handleDateFilterSelect = (value: "today" | "7d" | "30d") => {
    setDateFilter((current) => (current === value ? null : value));
  };

  const statusOptions = useMemo<StatusOption[]>(
    () => [
      { label: "Processing", values: ["processing", "draft"] },
      { label: "Done", values: ["done", "processed"] },
      { label: "Error", values: ["error"] },
    ],
    [],
  );
  const dateOptions: Array<{ value: "today" | "7d" | "30d"; label: string }> = [
    { value: "today", label: "Today" },
    { value: "7d", label: "7d" },
    { value: "30d", label: "30d" },
  ];

  const activeStatusCount = statusOptions.reduce((count, option) => {
    return option.values.every((value) => statusFilters.includes(value)) ? count + 1 : count;
  }, 0);
  const activeFilterCount = activeStatusCount + (dateFilter ? 1 : 0);
  const showingLabel = isLoadingJournals
    ? "Loading…"
    : `Showing ${journals.length} of ${totalCount}`;

  const selectedJournalFromCache = selectedJournalId
    ? journalDetailsCache[selectedJournalId] ?? null
    : null;
  const selectedJournalFromList = selectedJournalId
    ? journals.find((journal) => journal.id === selectedJournalId) ?? null
    : null;
  const selectedJournal = selectedJournalFromCache ?? selectedJournalFromList;

  useEffect(() => {
    if (!isJournalModalOpen) {
      setJournalForm({ templateId: "", languageCode: "" });
      journalFormJournalIdRef.current = null;
      return;
    }

    if (!selectedJournal) {
      setJournalForm({ templateId: "", languageCode: "" });
      journalFormJournalIdRef.current = null;
      return;
    }

    if (journalFormJournalIdRef.current === selectedJournal.id) {
      return;
    }

    setJournalForm({
      templateId: selectedJournal.template_id ?? "",
      languageCode: selectedJournal.language_code ?? "",
    });
    journalFormJournalIdRef.current = selectedJournal.id;
  }, [isJournalModalOpen, selectedJournal]);

  useEffect(() => {
    if (!isJournalModalOpen) {
      setResummarizeStatus("idle");
      setResummarizeMessage(null);
      return;
    }

    setResummarizeStatus("idle");
    setResummarizeMessage(null);
  }, [isJournalModalOpen, selectedJournalId]);

  const handleResummarize = useCallback(async () => {
    if (!selectedJournal) {
      return;
    }

    setResummarizeStatus("idle");
    setResummarizeMessage(null);
    setIsResummarizing(true);

    const nextTemplateId = journalForm.templateId.trim();
    const nextLanguageCode = journalForm.languageCode.trim();
    const updatedTemplateId = nextTemplateId.length > 0 ? nextTemplateId : null;
    const updatedLanguageCode = nextLanguageCode.length > 0 ? nextLanguageCode : null;

    try {
      const { error: updateError } = await supabase
        .from("journals")
        .update({
          template_id: updatedTemplateId,
          language_code: updatedLanguageCode,
        })
        .eq("id", selectedJournal.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setJournals((previous) =>
        previous.map((journal) =>
          journal.id === selectedJournal.id
            ? { ...journal, template_id: updatedTemplateId, language_code: updatedLanguageCode }
            : journal,
        ),
      );

      setJournalDetailsCache((previous) => {
        const current = previous[selectedJournal.id];
        if (!current) {
          return previous;
        }
        return {
          ...previous,
          [selectedJournal.id]: {
            ...current,
            template_id: updatedTemplateId,
            language_code: updatedLanguageCode,
          },
        };
      });

      if (updatedTemplateId) {
        const option = templateOptions.find((template) => template.id === updatedTemplateId);
        setTemplateNames((previous) => ({
          ...previous,
          [updatedTemplateId]: option?.name ?? "Untitled template",
        }));
      }

      let automationResponse: Response;
      try {
        automationResponse = await fetch(RESUMMARIZATION_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            journal_id: selectedJournal.id,
            template_id: updatedTemplateId,
            language_code: updatedLanguageCode,
          }),
        });
      } catch (networkError) {
        const message =
          networkError instanceof Error && networkError.message
            ? `Failed to trigger re-summarization: ${networkError.message}`
            : "Failed to trigger re-summarization. Please try again.";
        throw new Error(message);
      }

      if (!automationResponse.ok) {
        let errorDetail: string | null = null;
        try {
          errorDetail = await automationResponse.text();
        } catch (readError) {
          errorDetail = readError instanceof Error ? readError.message : null;
        }

        const trimmedDetail = errorDetail?.trim();
        throw new Error(
          trimmedDetail && trimmedDetail.length > 0
            ? `Failed to trigger re-summarization: ${trimmedDetail}`
            : "Failed to trigger re-summarization. Please try again.",
        );
      }

      setResummarizeStatus("success");
      setResummarizeMessage("Template and language saved. Re-summarization started.");
    } catch (error) {
      setResummarizeStatus("error");
      const messageText =
        error instanceof Error && error.message
          ? error.message
          : "Failed to re-summarize the journal.";
      setResummarizeMessage(messageText);
    } finally {
      setIsResummarizing(false);
    }
  }, [
    journalForm.languageCode,
    journalForm.templateId,
    selectedJournal,
    supabase,
    templateOptions,
  ]);

  const audioPath = selectedJournal?.audio_path ?? null;
  const audioObjectKey = useMemo(() => {
    if (!audioPath) {
      return null;
    }

    const trimmedPath = audioPath.startsWith("audio/")
      ? audioPath.slice("audio/".length)
      : audioPath;

    return trimmedPath.length > 0 ? trimmedPath : null;
  }, [audioPath]);

  const audioDownloadFileName = useMemo(() => {
    if (!audioObjectKey) {
      return "journal-audio.mp3";
    }

    const segments = audioObjectKey.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1];

    if (!lastSegment) {
      return "journal-audio.mp3";
    }

    return lastSegment.includes(".") ? lastSegment : `${lastSegment}.mp3`;
  }, [audioObjectKey]);

  const summaryContent = selectedJournalFromCache?.summary ?? null;
  const transcriptContent = selectedJournalFromCache?.transcript ?? null;
  const hasSummaryContent = Boolean(summaryContent && summaryContent.trim().length > 0);
  const hasTranscriptContent = Boolean(transcriptContent && transcriptContent.trim().length > 0);
  const summaryFeedback =
    copyStatus.summary === "copied"
      ? "Copied!"
      : copyStatus.summary === "error"
      ? "Unable to copy"
      : null;
  const transcriptFeedback =
    copyStatus.transcript === "copied"
      ? "Copied!"
      : copyStatus.transcript === "error"
      ? "Unable to copy"
      : null;

  useEffect(() => {
    if (!isJournalModalOpen) {
      setAudioPlaybackUrl(null);
      setAudioUrlError(null);
      setIsLoadingAudioUrl(false);
      return;
    }

    if (!audioPath) {
      setAudioPlaybackUrl(null);
      setAudioUrlError(null);
      setIsLoadingAudioUrl(false);
      return;
    }

    if (!audioObjectKey) {
      setAudioPlaybackUrl(null);
      setAudioUrlError("Audio file is unavailable.");
      setIsLoadingAudioUrl(false);
      return;
    }

    let isCancelled = false;

    const loadSignedUrl = async () => {
      setIsLoadingAudioUrl(true);
      setAudioUrlError(null);
      setAudioPlaybackUrl(null);

      try {
        const { data, error } = await supabase.storage
          .from("audio")
          .createSignedUrl(audioObjectKey, 60 * 60);

        if (isCancelled) {
          return;
        }

        if (error || !data?.signedUrl) {
          setAudioPlaybackUrl(null);
          setAudioUrlError("Unable to load the audio file.");
        } else {
          setAudioPlaybackUrl(data.signedUrl);
        }
      } catch {
        if (!isCancelled) {
          setAudioPlaybackUrl(null);
          setAudioUrlError("Unable to load the audio file.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingAudioUrl(false);
        }
      }
    };

    void loadSignedUrl();

    return () => {
      isCancelled = true;
    };
  }, [audioObjectKey, audioPath, isJournalModalOpen, supabase]);

  const handleDownloadAudio = useCallback(() => {
    const downloadFileName = audioDownloadFileName || "journal-audio.mp3";

    if (!audioObjectKey && !audioPlaybackUrl) {
      return;
    }

    const triggerDownload = (downloadUrl: string) => {
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = downloadFileName;
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    };

    const createDownloadUrl = async () => {
      let downloadUrl: string | null = null;

      if (audioObjectKey) {
        try {
          const { data, error } = await supabase.storage
            .from("audio")
            .createSignedUrl(audioObjectKey, 60 * 60, { download: downloadFileName });

          if (!error && data?.signedUrl) {
            downloadUrl = data.signedUrl;
          }
        } catch {
          downloadUrl = null;
        }
      }

      if (!downloadUrl) {
        if (!audioPlaybackUrl) {
          return;
        }

        downloadUrl = audioPlaybackUrl;
      }

      triggerDownload(downloadUrl);
    };

    void createDownloadUrl();
  }, [audioDownloadFileName, audioObjectKey, audioPlaybackUrl, supabase]);

  const handleDeleteJournal = useCallback(async () => {
    if (!selectedJournal) {
      return;
    }

    const audioBucketPath = selectedJournal.audio_path;

    const confirmDelete = window.confirm(
      "Are you sure you want to delete this journal? This action cannot be undone.",
    );

    if (!confirmDelete) {
      return;
    }

    setIsDeletingJournal(true);
    setMessage(null);

    try {
      const { error } = await supabase.from("journals").delete().eq("id", selectedJournal.id);

      if (error) {
        throw new Error(error.message);
      }

      if (audioBucketPath) {
        try {
          const response = await fetch(JOURNAL_AUDIO_DELETE_WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ audio_bucket_path: audioBucketPath }),
          });

          if (!response.ok) {
            let errorDetail: string | null = null;
            try {
              errorDetail = await response.text();
            } catch (readError) {
              errorDetail = readError instanceof Error ? readError.message : null;
            }

            const trimmedDetail = errorDetail?.trim();
            console.error(
              trimmedDetail && trimmedDetail.length > 0
                ? `Failed to trigger audio cleanup webhook: ${trimmedDetail}`
                : "Failed to trigger audio cleanup webhook.",
            );
          }
        } catch (webhookError) {
          const message =
            webhookError instanceof Error && webhookError.message
              ? webhookError.message
              : String(webhookError);
          console.error(`Failed to trigger audio cleanup webhook: ${message}`);
        }
      }

      setJournals((previous) => previous.filter((journal) => journal.id !== selectedJournal.id));
      setJournalDetailsCache((previous) => {
        const { [selectedJournal.id]: _removed, ...rest } = previous;
        return rest;
      });
      setTotalCount((previousCount) => {
        const nextCount = previousCount > 0 ? previousCount - 1 : 0;
        const nextTotalPages = nextCount > 0 ? Math.ceil(nextCount / PAGE_SIZE) : 1;
        setTotalPages(nextTotalPages);
        setPage((previousPage) => Math.min(previousPage, nextTotalPages));
        return nextCount;
      });
      setMessage({ tone: "info", text: "Journal deleted." });
      handleCloseJournalModal();
    } catch (error) {
      const messageText =
        error instanceof Error && error.message
          ? error.message
          : "Failed to delete the journal.";
      setMessage({ tone: "error", text: messageText });
    } finally {
      setIsDeletingJournal(false);
    }
  }, [handleCloseJournalModal, selectedJournal, setMessage, supabase]);

  return (
    <main className="dashboard-page">
      <div className="dashboard-shell">
        <header className="dashboard-header">
          <div className="dashboard-brand">
            <span className="dashboard-logo" aria-hidden="true">
              <Image
                src="/branding/favicon.svg"
                alt="Journal.vet logo"
                width={64}
                height={64}
                priority
                className="dashboard-logo__image"
              />
            </span>
            <div className="dashboard-heading">
              <span className="dashboard-heading__label">Workspace</span>
              <h1 className="dashboard-heading__title">{workspaceTitle}</h1>
              <p className="dashboard-heading__subtitle">{displayName}</p>
            </div>
          </div>
          <div className="dashboard-user" ref={menuRef}>
            <button
              ref={menuButtonRef}
              type="button"
              className="dashboard-user__button"
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((open) => !open)}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M12 12.75c2.347 0 4.25-1.903 4.25-4.25S14.347 4.25 12 4.25 7.75 6.153 7.75 8.5 9.653 12.75 12 12.75Zm0 2.25c-3.11 0-9.25 1.563-9.25 4.672 0 .758.617 1.328 1.375 1.328h15.75c.758 0 1.375-.57 1.375-1.328 0-3.109-6.14-4.672-9.25-4.672Z"
                  fill="currentColor"
                />
              </svg>
              <span className="visually-hidden">Open profile menu</span>
            </button>
            {isMenuOpen ? (
              <div className="dashboard-menu" role="menu">
                <div className="dashboard-menu__section">
                  <span className="dashboard-menu__label">Signed in as</span>
                  <strong className="dashboard-menu__value">{displayName}</strong>
                  {user?.email && profile?.full_name?.trim() ? (
                    <span className="dashboard-menu__meta">{user.email}</span>
                  ) : null}
                </div>
                <div className="dashboard-menu__section">
                  <span className="dashboard-menu__label">Workspaces</span>
                  <ul className="workspace-switcher" role="list">
                    {workspaces.map((workspace) => {
                      const isActive = workspace.id === currentWorkspaceId;
                      return (
                        <li key={workspace.id}>
                          <button
                            type="button"
                            className={`workspace-switcher__button${isActive ? " workspace-switcher__button--active" : ""}`}
                            onClick={() => {
                              void handleWorkspaceChange(workspace.id);
                            }}
                          >
                            {workspace.name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="dashboard-menu__section">
                  <Link
                    href="/settings"
                    className="dashboard-menu__link"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Profile settings
                  </Link>
                  <Link
                    href="/settings/templates"
                    className="dashboard-menu__link"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Templates
                  </Link>
                </div>
                <button
                  type="button"
                  className="btn btn-primary dashboard-menu__signout"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                >
                  {isSigningOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {message ? (
          <p
            className={`auth-message ${
              message.tone === "error" ? "auth-message--error" : "auth-message--info"
            } dashboard-message`}
            role={message.tone === "error" ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}

        <section className="dashboard-card recording-card">
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.webm,audio/mpeg,audio/mp3,audio/x-mp3,audio/wav,audio/x-wav,audio/wave,audio/x-pn-wav,audio/mp4,audio/m4a,audio/x-m4a,audio/webm"
            className="recording-card__file-input"
            onChange={handleAudioFileChange}
          />
          <div className="recording-card__header">
            <div className="recording-card__intro">
              <h2 className="recording-card__title">Start new recording</h2>
              <p className="recording-card__description">
                Capture your next consultation and save it as a journal entry when you’re ready.
              </p>
            </div>
            {recordingState === "idle" ? (
              <div className="recording-card__actions">
                <button
                  type="button"
                  className="btn btn-primary recording-card__primary"
                  onClick={handleStartRecording}
                  disabled={isRequestingMicrophone || isSavingRecording}
                >
                  {isRequestingMicrophone ? "Starting…" : "Start new recording"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary recording-card__upload"
                  onClick={handleUploadAudioClick}
                  disabled={isRequestingMicrophone || isSavingRecording || isProcessingRecording}
                >
                  Upload audio
                </button>
              </div>
            ) : recordingState === "recording" ? (
              <button
                type="button"
                className="btn btn-secondary recording-card__primary"
                onClick={handleStopRecording}
                disabled={isProcessingRecording}
              >
                Stop recording
              </button>
            ) : (
              <div className="recording-card__controls">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleOpenSaveModal}
                  disabled={isProcessingRecording || isSavingRecording || !recordingBlob}
                >
                  {isSavingRecording ? "Saving…" : "Save recording"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary recording-card__delete"
                  onClick={handleResetRecording}
                  disabled={isSavingRecording}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
          <div className="recording-card__body">
            {recordingState === "idle" ? (
              <p className="recording-card__hint">
                Record directly in your browser or upload an MP3, WAV, M4A, or WebM file up to 200 MB.
              </p>
            ) : recordingState === "recording" ? (
              <div
                className="recording-card__status recording-card__status--active"
                role="status"
                aria-live="polite"
              >
                <span className="recording-card__mic recording-card__mic--active" aria-hidden="true" />
                <div className="recording-card__status-text">
                  <span className="recording-card__state">Recording…</span>
                  <span className="recording-card__timer">{formatElapsedTime(recordingDuration)}</span>
                </div>
              </div>
            ) : (
              <div className="recording-card__ready">
                <div
                  className="recording-card__status recording-card__status--stopped"
                  role="status"
                  aria-live="polite"
                >
                  <span className="recording-card__mic recording-card__mic--stopped" aria-hidden="true" />
                  <div className="recording-card__status-text">
                    <span className="recording-card__state">
                      {isProcessingRecording ? "Processing recording…" : "Ready to save"}
                    </span>
                    <span className="recording-card__timer">{formatElapsedTime(recordingDuration)}</span>
                  </div>
                </div>
                {recordingPreviewUrl ? (
                  <div className="recording-card__preview">
                    <audio controls src={recordingPreviewUrl} preload="metadata" />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <section className="dashboard-card">
          <div className="dashboard-card__header">
            <div className="dashboard-card__intro">
              <h2>Recent journals</h2>
              <p>Monitor processing progress and revisit the latest activity across your workspace.</p>
            </div>
            <div className="dashboard-card__actions">
              <div className="dashboard-controls">
                <div className="dashboard-search">
                  <label className="visually-hidden" htmlFor="dashboard-search">
                    Search journals
                  </label>
                  <input
                    id="dashboard-search"
                    type="search"
                    className="dashboard-search__input"
                    placeholder="Search summaries or transcripts"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
                <div className="dashboard-filters" ref={filtersRef}>
                  <button
                    type="button"
                    className="dashboard-filters__button"
                    aria-haspopup="true"
                    aria-expanded={isFilterOpen}
                    onClick={() => setIsFilterOpen((open) => !open)}
                  >
                    Filters
                    {activeFilterCount > 0 ? (
                      <span className="dashboard-filters__badge">{activeFilterCount}</span>
                    ) : null}
                  </button>
                  {isFilterOpen ? (
                    <div className="dashboard-filters__popover" role="dialog" aria-label="Journal filters">
                      <div className="dashboard-filters__section">
                        <span className="dashboard-filters__label">Date</span>
                        <div className="dashboard-filters__options">
                          {dateOptions.map((option) => {
                            const isActive = dateFilter === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                className={`dashboard-filters__option${
                                  isActive ? " dashboard-filters__option--active" : ""
                                }`}
                                onClick={() => handleDateFilterSelect(option.value)}
                                aria-pressed={isActive}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="dashboard-filters__section">
                        <span className="dashboard-filters__label">Status</span>
                        <div className="dashboard-filters__options dashboard-filters__options--grid">
                          {statusOptions.map((option) => {
                            const isActive = option.values.every((value) => statusFilters.includes(value));
                            return (
                              <button
                                key={option.label}
                                type="button"
                                className={`dashboard-filters__option${
                                  isActive ? " dashboard-filters__option--active" : ""
                                }`}
                                onClick={() => toggleStatusFilter(option)}
                                aria-pressed={isActive}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                <label className="dashboard-sort" htmlFor="dashboard-sort">
                  <span className="dashboard-sort__label">Sort</span>
                  <select
                    id="dashboard-sort"
                    className="dashboard-sort__select"
                    value={sortOrder}
                    onChange={(event) => setSortOrder(event.target.value === "asc" ? "asc" : "desc")}
                  >
                    <option value="desc">Newest</option>
                    <option value="asc">Oldest</option>
                  </select>
                </label>
              </div>
              <span className="dashboard-card__badge">{showingLabel}</span>
            </div>
          </div>

          <div className="dashboard-table-wrapper">
            {isLoadingJournals ? (
              <div className="dashboard-empty">Loading journals…</div>
            ) : journals.length === 0 ? (
              <div className="dashboard-empty">
                <h3>No journals yet</h3>
                <p>Once you record or upload a session, it will appear here with its processing status.</p>
              </div>
            ) : (
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th scope="col">Created</th>
                    <th scope="col">Status</th>
                    <th scope="col">Template</th>
                    <th scope="col">Author</th>
                    <th scope="col">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {journals.map((journal) => {
                    const durationValue = parseDuration(journal.meta);
                    const duration = formatDuration(durationValue);
                    const statusClass = getStatusClassName(journal.status);
                    const statusLabel = formatStatusLabel(journal.status);
                    const templateName = journal.template_id ? templateNames[journal.template_id] : undefined;
                    const createdAtLabel = formatDateTime(journal.created_at);
                    const authorLabel =
                      journal.created_by && journal.created_by === user?.id
                        ? "You"
                        : journal.created_by_email
                        ? journal.created_by_email
                        : journal.created_by
                        ? `${journal.created_by.slice(0, 8)}…`
                        : "—";

                    return (
                      <tr
                        key={journal.id}
                        className="dashboard-table__row"
                        role="button"
                        tabIndex={0}
                        onClick={() => handleOpenJournal(journal.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleOpenJournal(journal.id);
                          }
                        }}
                        aria-label={`Open journal created ${createdAtLabel}`}
                      >
                        <td>
                          <span className="dashboard-table__primary">{createdAtLabel}</span>
                          {journal.language_code ? (
                            <span className="dashboard-table__meta">{journal.language_code.toUpperCase()}</span>
                          ) : null}
                        </td>
                        <td>
                          {journal.status?.toLowerCase() === "processing" ? (
                            <ProcessingStatusIndicator
                              statusClassName={statusClass}
                              updatedAt={journal.updated_at}
                              durationSeconds={durationValue}
                            />
                          ) : (
                            <span className={statusClass}>{statusLabel || "—"}</span>
                          )}
                        </td>
                        <td>
                          <span className="dashboard-table__primary">{templateName ?? "Untitled template"}</span>
                          {journal.template_id && !templateName ? (
                            <span className="dashboard-table__meta">Loading template…</span>
                          ) : null}
                        </td>
                        <td>
                          <span className="dashboard-table__primary">{authorLabel}</span>
                        </td>
                        <td>
                          <span className="dashboard-table__primary">{duration}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

        {totalPages > 1 ? (
          <nav className="dashboard-pagination" aria-label="Journals pagination">
            <button
              type="button"
              className="dashboard-pagination__button"
                onClick={handlePreviousPage}
                disabled={page === 1}
              >
                Previous
              </button>
              <div className="dashboard-pagination__pages">
                {Array.from({ length: totalPages }, (_, index) => {
                  const pageNumber = index + 1;
                  const isActive = pageNumber === page;

                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      className={`dashboard-pagination__number${isActive ? " dashboard-pagination__number--active" : ""}`}
                      onClick={() => setPage(pageNumber)}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="dashboard-pagination__button"
                onClick={handleNextPage}
                disabled={page === totalPages}
              >
                Next
              </button>
          </nav>
        ) : null}
      </section>

      {isJournalModalOpen ? (
        <div
          className="templates-modal journal-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="journal-modal-title"
        >
          <div className="templates-modal__overlay" onClick={handleCloseJournalModal} aria-hidden="true" />
          <div
            className="templates-modal__dialog journal-modal__dialog"
            role="document"
            ref={journalModalRef}
            tabIndex={-1}
          >
            <div className="templates-modal__header">
              <h2 className="templates-modal__title" id="journal-modal-title">
                Journal details
              </h2>
              <button
                type="button"
                className="templates-modal__close"
                onClick={handleCloseJournalModal}
                aria-label="Close journal details"
              >
                ×
              </button>
            </div>
            <div className="journal-modal__body">
              <section className="journal-modal__section journal-modal__section--settings">
                <h3 className="journal-modal__section-title">Settings</h3>
                <div className="journal-modal__settings-grid">
                  <div className="journal-modal__field">
                    <label className="journal-modal__label" htmlFor="journalTemplate">
                      Template
                    </label>
                    <select
                      id="journalTemplate"
                      className="auth-input journal-modal__select"
                      value={journalForm.templateId}
                      onChange={(event) =>
                        setJournalForm((previous) => ({
                          ...previous,
                          templateId: event.target.value,
                        }))
                      }
                      disabled={isLoadingTemplates || isResummarizing}
                    >
                      <option value="">No template selected</option>
                      {templateOptions.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name ?? "Untitled template"}
                        </option>
                      ))}
                    </select>
                    {isLoadingTemplates ? (
                      <p className="journal-modal__hint">Loading templates…</p>
                    ) : templatesError ? (
                      <p className="journal-modal__error" role="alert">
                        {templatesError}
                      </p>
                    ) : null}
                  </div>
                  <div className="journal-modal__field">
                    <label className="journal-modal__label" htmlFor="journalLanguage">
                      Language
                    </label>
                    <select
                      id="journalLanguage"
                      className="auth-input journal-modal__select"
                      value={journalForm.languageCode}
                      onChange={(event) =>
                        setJournalForm((previous) => ({
                          ...previous,
                          languageCode: event.target.value,
                        }))
                      }
                      disabled={isLoadingLanguages || isResummarizing}
                    >
                      <option value="">No language preference</option>
                      {languageOptions.map((language) => (
                        <option key={language.code} value={language.code}>
                          {language.label
                            ? `${language.label} (${language.code.toUpperCase()})`
                            : language.code.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    {isLoadingLanguages ? (
                      <p className="journal-modal__hint">Loading languages…</p>
                    ) : languagesError ? (
                      <p className="journal-modal__error" role="alert">
                        {languagesError}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="journal-modal__settings-actions">
                  <button
                    type="button"
                    className="btn btn-primary journal-modal__resummarize"
                    onClick={handleResummarize}
                    disabled={isResummarizing || !selectedJournal}
                  >
                    {isResummarizing ? "Re-Summarizing…" : "Re-Summarize"}
                  </button>
                  <span
                    className={`journal-modal__feedback${
                      resummarizeStatus === "error" ? " journal-modal__feedback--error" : ""
                    }`}
                    aria-live="polite"
                  >
                    {resummarizeMessage}
                  </span>
                </div>
              </section>

              {journalDetailsError ? (
                <div className="journal-modal__message" role="alert">
                  {journalDetailsError}
                </div>
              ) : null}

              <section className="journal-modal__section" aria-labelledby="journal-summary-title">
                <div className="journal-modal__section-header">
                  <h3 className="journal-modal__section-title" id="journal-summary-title">
                    Summary
                  </h3>
                  <div className="journal-modal__actions">
                    <button
                      type="button"
                      className="journal-modal__copy"
                      onClick={() => {
                        void handleCopyContent("summary", summaryContent, {
                          sourceElement: summaryContentRef.current,
                        });
                      }}
                      disabled={!hasSummaryContent || Boolean(journalDetailsError) || isLoadingJournalDetails}
                    >
                      Copy
                    </button>
                    <span className="journal-modal__feedback" aria-live="polite">
                      {summaryFeedback}
                    </span>
                  </div>
                </div>
                <div className="journal-modal__content" aria-live="polite">
                  {journalDetailsError ? (
                    <p className="journal-modal__placeholder">Unable to load the summary.</p>
                  ) : isLoadingJournalDetails && !selectedJournalFromCache ? (
                    <p className="journal-modal__placeholder">Loading summary…</p>
                  ) : hasSummaryContent ? (
                    <p className="journal-modal__text" ref={summaryContentRef}>
                      {summaryContent}
                    </p>
                  ) : (
                    <p className="journal-modal__placeholder">No summary is available yet.</p>
                  )}
                </div>
              </section>

              <section className="journal-modal__section" aria-labelledby="journal-transcript-title">
                <div className="journal-modal__section-header">
                  <h3 className="journal-modal__section-title" id="journal-transcript-title">
                    Transcription
                  </h3>
                  {selectedJournal?.audio_path ? (
                    <div className="journal-modal__audio" aria-live="polite">
                      {isLoadingAudioUrl ? (
                        <p className="journal-modal__audio-status">Loading audio…</p>
                      ) : audioUrlError ? (
                        <p className="journal-modal__audio-status journal-modal__audio-status--error">
                          {audioUrlError}
                        </p>
                      ) : audioPlaybackUrl ? (
                        <audio
                          controls
                          src={audioPlaybackUrl}
                          preload="metadata"
                          aria-label="Journal audio playback"
                        >
                          Your browser does not support the audio element.
                        </audio>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="journal-modal__actions">
                    <button
                      type="button"
                      className="journal-modal__copy"
                      onClick={() => {
                        void handleCopyContent("transcript", transcriptContent, {
                          sourceElement: transcriptContentRef.current,
                        });
                      }}
                      disabled={
                        !hasTranscriptContent || Boolean(journalDetailsError) || isLoadingJournalDetails
                      }
                    >
                      Copy
                    </button>
                    {audioPath ? (
                      <button
                        type="button"
                        className="journal-modal__download"
                        onClick={handleDownloadAudio}
                        disabled={!audioPlaybackUrl || isLoadingAudioUrl}
                      >
                        Download audio
                      </button>
                    ) : null}
                    <span className="journal-modal__feedback" aria-live="polite">
                      {transcriptFeedback}
                    </span>
                  </div>
                </div>
                <div className="journal-modal__content" aria-live="polite">
                  {journalDetailsError ? (
                    <p className="journal-modal__placeholder">Unable to load the transcription.</p>
                  ) : isLoadingJournalDetails && !selectedJournalFromCache ? (
                    <p className="journal-modal__placeholder">Loading transcription…</p>
                  ) : hasTranscriptContent ? (
                    <p className="journal-modal__text" ref={transcriptContentRef}>
                      {transcriptContent}
                    </p>
                  ) : (
                    <p className="journal-modal__placeholder">No transcription is available yet.</p>
                  )}
                </div>
              </section>

              <div className="journal-modal__footer">
                <button
                  type="button"
                  className="btn btn-secondary journal-modal__delete"
                  onClick={handleDeleteJournal}
                  disabled={isDeletingJournal || !selectedJournal}
                >
                  {isDeletingJournal ? "Deleting…" : "Delete journal"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isSaveModalOpen ? (
        <div
          className="templates-modal recording-modal"
          role="dialog"
          aria-modal="true"
            aria-labelledby="recording-save-title"
          >
            <div className="templates-modal__overlay" onClick={handleCloseSaveModal} aria-hidden="true" />
            <div
              className="templates-modal__dialog templates-modal__dialog--form"
              role="document"
              ref={saveModalRef}
              tabIndex={-1}
            >
              <div className="templates-modal__header">
                <h2 className="templates-modal__title" id="recording-save-title">
                  Save recording
                </h2>
                <button
                  type="button"
                  className="templates-modal__close"
                  onClick={handleCloseSaveModal}
                  aria-label="Close save recording modal"
                  disabled={isSavingRecording}
                >
                  ×
                </button>
              </div>
              <form
                className="templates-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSaveRecording();
                }}
              >
                <div className="templates-form__field">
                  <label htmlFor="recordingTemplate">Template</label>
                  <select
                    id="recordingTemplate"
                    className="auth-input templates-form__select"
                    value={saveForm.templateId}
                    onChange={(event) =>
                      setSaveForm((previous) => ({ ...previous, templateId: event.target.value }))
                    }
                    disabled={isLoadingTemplates || isSavingRecording}
                  >
                    <option value="">No template selected</option>
                    {templateOptions.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name ?? "Untitled template"}
                      </option>
                    ))}
                  </select>
                  {isLoadingTemplates ? (
                    <p className="templates-form__hint">Loading templates…</p>
                  ) : templatesError ? (
                    <p className="templates-form__error" role="alert">
                      {templatesError}
                    </p>
                  ) : null}
                </div>
                <div className="templates-form__field">
                  <label htmlFor="recordingLanguage">Language</label>
                  <select
                    id="recordingLanguage"
                    className="auth-input templates-form__select"
                    value={saveForm.languageCode}
                    onChange={(event) =>
                      setSaveForm((previous) => ({ ...previous, languageCode: event.target.value }))
                    }
                    disabled={isLoadingLanguages || isSavingRecording}
                  >
                    <option value="">No language preference</option>
                    {languageOptions.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.label ?? language.code.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  {isLoadingLanguages ? (
                    <p className="templates-form__hint">Loading languages…</p>
                  ) : languagesError ? (
                    <p className="templates-form__error" role="alert">
                      {languagesError}
                    </p>
                  ) : null}
                </div>
                <div className="templates-form__actions">
                  <button
                    type="button"
                    className="btn templates-form__cancel"
                    onClick={handleCloseSaveModal}
                    disabled={isSavingRecording}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary templates-form__submit"
                    disabled={isSavingRecording || isProcessingRecording || !recordingBlob}
                  >
                    {isSavingRecording ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
