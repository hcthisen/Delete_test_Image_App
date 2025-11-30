import { createRequestId } from "./logger";

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const pattern = `; ${document.cookie}`;
  const parts = pattern.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() ?? null;
  return null;
}

export function getRequestId() {
  if (typeof document === "undefined") {
    return createRequestId();
  }

  const existing = readCookie("requestId");
  if (existing) return existing;

  const generated = createRequestId();
  document.cookie = `requestId=${generated}; path=/; samesite=lax`;
  return generated;
}
