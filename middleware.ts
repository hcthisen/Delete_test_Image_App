import { NextResponse, type NextRequest } from "next/server";

import { createRequestId, logger } from "./lib/logger";

function shouldLogRequest(path: string) {
  if (path.startsWith("/_next") || path.startsWith("/favicon") || path.startsWith("/assets")) {
    return false;
  }
  return true;
}

export function middleware(request: NextRequest) {
  const existingRequestId =
    request.headers.get("x-request-id") ?? request.cookies.get("requestId")?.value ?? createRequestId();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", existingRequestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("x-request-id", existingRequestId);

  if (!request.cookies.get("requestId")) {
    response.cookies.set("requestId", existingRequestId, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
    });
  }

  if (shouldLogRequest(request.nextUrl.pathname)) {
    logger.info({
      scope: "http.request",
      msg: "Request received",
      requestId: existingRequestId,
      http: {
        method: request.method,
        path: request.nextUrl.pathname,
      },
    });
  }

  return response;
}
