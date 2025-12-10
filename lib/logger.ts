type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = {
  scope: string;
  msg: string;
  requestId?: string;
  userId?: string | null;
  avatarId?: string;
  imageId?: string;
  jobId?: string;
  taskId?: string;
  operation?: string;
  durationMs?: number;
  payloadSummary?: unknown;
  http?: {
    method?: string;
    path?: string;
    status?: number;
  };
  externalService?: string;
  statusCode?: number;
  retryCount?: number;
  eventType?: string;
  targetUrl?: string;
  err?: unknown;
};

const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LEVEL = process.env.LOG_LEVEL
  ? process.env.LOG_LEVEL.toLowerCase()
  : process.env.NODE_ENV === "development"
    ? "debug"
    : "info";

const RESOLVED_LEVEL: LogLevel = (LEVEL_WEIGHTS as Record<string, number>)[DEFAULT_LEVEL]
  ? (DEFAULT_LEVEL as LogLevel)
  : "info";

const errorCounts = new Map<string, number>();

function shouldLog(level: LogLevel) {
  return LEVEL_WEIGHTS[level] >= LEVEL_WEIGHTS[RESOLVED_LEVEL];
}

function maskUserId(userId?: string | null) {
  if (!userId) return undefined;
  if (userId.length <= 8) return `${userId[0]}***${userId[userId.length - 1]}`;
  return `${userId.slice(0, 4)}…${userId.slice(-4)}`;
}

function truncate(value: string, limit = 800) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…[truncated]`;
}

function formatError(err: unknown) {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: truncate(err.message, 400),
      stack: err.stack ? truncate(err.stack, 1200) : undefined,
    };
  }

  const fallback = (() => {
    if (typeof err === "string") return err;
    try {
      return JSON.stringify(err);
    } catch (serializationError) {
      return String(serializationError ?? err);
    }
  })();
  return { name: "Error", message: truncate(fallback, 400) };
}

function serializePayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
  );
}

function shouldEmitErrorLog(signature: string) {
  const count = (errorCounts.get(signature) ?? 0) + 1;
  errorCounts.set(signature, count);
  return { emit: count === 1 || count % 5 === 0, count };
}

function buildBaseEntry(level: LogLevel, context: LogContext) {
  const errorInfo = formatError(context.err);
  const signature = errorInfo ? `${context.scope}:${errorInfo.name}:${errorInfo.message}` : undefined;
  const dedupInfo = signature ? shouldEmitErrorLog(signature) : { emit: true, count: 1 };

  const payload = serializePayload({
    level,
    scope: context.scope,
    msg: context.msg,
    requestId: context.requestId,
    userId: maskUserId(context.userId ?? undefined),
    avatarId: context.avatarId,
    imageId: context.imageId,
    jobId: context.jobId,
    taskId: context.taskId,
    operation: context.operation,
    durationMs: context.durationMs,
    payloadSummary: context.payloadSummary,
    http: context.http,
    externalService: context.externalService,
    statusCode: context.statusCode,
    retryCount: context.retryCount,
    eventType: context.eventType,
    targetUrl: context.targetUrl,
    error: errorInfo,
    occurrences: signature ? dedupInfo.count : undefined,
  });

  return { payload, shouldEmit: level !== "error" || dedupInfo.emit };
}

function emit(level: LogLevel, payload: Record<string, unknown>) {
  const serialized = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialized);
  } else if (level === "warn") {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
}

function log(level: LogLevel, context: LogContext) {
  if (!shouldLog(level)) return;
  const { payload, shouldEmit } = buildBaseEntry(level, context);
  if (!shouldEmit) return;
  emit(level, payload);
}

export const logger = {
  debug: (context: LogContext) => log("debug", context),
  info: (context: LogContext) => log("info", context),
  warn: (context: LogContext) => log("warn", context),
  error: (context: LogContext) => log("error", context),
};

export function safeSummary(value: unknown) {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return truncate(text, 200);
  } catch (error) {
    return "[unserializable payload]";
  }
}

export function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
