import * as Sentry from "@sentry/electron/renderer";
import log from "electron-log/renderer";

/**
 * Forwards uncaught renderer errors to the main process, which filters and
 * sanitizes them before anything is queued or sent. No breadcrumbs are
 * collected here (no console, fetch, DOM or navigation tracking).
 */
Sentry.init({
  defaultIntegrations: false,
  integrations: [
    Sentry.globalHandlersIntegration(),
    Sentry.linkedErrorsIntegration(),
    Sentry.dedupeIntegration(),
  ],
});

// Renderer console output also lands in main.log (sanitized in main).
Object.assign(console, log.functions);
