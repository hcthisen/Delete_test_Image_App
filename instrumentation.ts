import { logger } from "./lib/logger";

export async function register() {
  if (typeof process === "undefined") return;

  process.on("uncaughtException", (error) => {
    logger.error({
      scope: "process.uncaughtException",
      msg: "Uncaught exception",
      err: error,
    });
  });

  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error({
      scope: "process.unhandledRejection",
      msg: "Unhandled promise rejection",
      err: error,
    });
  });
}
