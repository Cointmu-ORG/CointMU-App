import * as Sentry from "@sentry/electron/main";
import { NodeRecoveryStage, type NodeRecoveryEvent } from "../../bridge/types";
import {
  GethLineSeverity,
  classifyGethLine,
  type GethErrorKind,
} from "../utils/gethErrorClassifier";
import { BreadcrumbCategory, ReportTag } from "./eventAllowlist";
import { sanitizeLocal } from "./localSanitizer";

const MAX_GETH_LINE_CHARS = 500;
const DIGITS_PATTERN = /\d+/g;
const FINGERPRINT_PREFIX = "geth-recovery-failed";
const NO_FATAL_SEEN = "no fatal line seen";

let lastFatal: { kind: GethErrorKind; line: string } | null = null;

/**
 * Records a classified geth line (fatal, or a recognised error) as a
 * breadcrumb, so a later report shows what geth printed before it failed.
 * Unclassified lines are ignored; they only go to geth.log.
 * @param line - One complete geth log line.
 */
export function recordGethLine(line: string): void {
  const classification = classifyGethLine(line);
  if (!classification) return;
  const isFatal = classification.severity === GethLineSeverity.FATAL;
  const message = line.slice(0, MAX_GETH_LINE_CHARS);
  if (isFatal) lastFatal = { kind: classification.kind, line: message };
  Sentry.addBreadcrumb({
    category: BreadcrumbCategory.GETH,
    level: isFatal ? "fatal" : "error",
    message: `${classification.kind}: ${message}`,
  });
}

function describeRecoveryEvent(event: NodeRecoveryEvent): string {
  const parts: string[] = [event.stage];
  if (event.reason) parts.push(event.reason);
  if (event.attempt !== undefined) {
    parts.push(`attempt ${event.attempt}/${event.maxAttempts ?? "?"}`);
  }
  return parts.join(" ");
}

/**
 * Records every recovery stage as a breadcrumb and reports a FAILED stage
 * (automatic recovery stopped) as an error grouped by the last fatal line.
 * @param event - The recovery event broadcast to the renderer.
 */
export function reportRecoveryEvent(event: NodeRecoveryEvent): void {
  Sentry.addBreadcrumb({
    category: BreadcrumbCategory.RECOVERY,
    level: "info",
    message: describeRecoveryEvent(event),
  });
  if (event.stage !== NodeRecoveryStage.FAILED) return;
  const fatalLine = lastFatal?.line ?? NO_FATAL_SEEN;
  Sentry.captureMessage(`geth recovery failed: ${fatalLine}`, {
    level: "error",
    tags: {
      [ReportTag.GETH_KIND]: lastFatal?.kind ?? "none",
      [ReportTag.RECOVERY_STAGE]: event.stage,
    },
    fingerprint: [
      FINGERPRINT_PREFIX,
      sanitizeLocal(fatalLine).replace(DIGITS_PATTERN, "#"),
    ],
  });
}
