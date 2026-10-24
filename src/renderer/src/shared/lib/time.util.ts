import { intervalToDuration, isAfter, subDays } from "date-fns";

const IDLE_DURATION_PLACEHOLDER = "--";
const MILLISECONDS_PER_SECOND = 1000;

/** Largest unit first: an age uses the first unit it reaches. */
const RELATIVE_TIME_UNITS: ReadonlyArray<{
  unit: Intl.RelativeTimeFormatUnit;
  seconds: number;
}> = [
  { unit: "year", seconds: 365 * 24 * 60 * 60 },
  { unit: "month", seconds: 30 * 24 * 60 * 60 },
  { unit: "day", seconds: 24 * 60 * 60 },
  { unit: "hour", seconds: 60 * 60 },
  { unit: "minute", seconds: 60 },
];

/**
 * Left-pads a numeric value to two digits for fixed-width clock display.
 * @param {any} value - The number to pad.
 * @returns {any} A two-character zero-padded string.
 */
function padTwo(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Formats an elapsed duration in milliseconds into a compact clock string using
 * date-fns intervalToDuration. Hours are only shown once the elapsed time
 * reaches one hour, otherwise a minutes and seconds layout is used.
 * @param {any} elapsedMs - The elapsed duration in milliseconds.
 * @returns {any} A formatted duration string such as '1h 02m 03s' or '02m 03s'.
 */
function formatElapsed(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return IDLE_DURATION_PLACEHOLDER;
  }

  const duration = intervalToDuration({ start: 0, end: elapsedMs });
  const hours = duration.hours ?? 0;
  const minutes = duration.minutes ?? 0;
  const seconds = duration.seconds ?? 0;
  const totalHours = (duration.days ?? 0) * 24 + hours;

  if (totalHours > 0) {
    return `${totalHours}h ${padTwo(minutes)}m ${padTwo(seconds)}s`;
  }

  return `${padTwo(minutes)}m ${padTwo(seconds)}s`;
}

/**
 * Formats a Unix timestamp expressed in seconds as a relative age in the given
 * language, rounded down to the largest whole unit (e.g. 'now', '5 seconds ago',
 * 'vor 3 Minuten', 'yesterday'). Intl picks the plural form for each language.
 * @param timestampSeconds - The Unix timestamp in seconds.
 * @param locale - BCP 47 language tag, usually i18n.language.
 * @returns The relative age, or '--' for a missing timestamp.
 */
function formatAge(timestampSeconds: number, locale: string): string {
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
    return IDLE_DURATION_PLACEHOLDER;
  }

  const ageSeconds = Math.max(
    0,
    Math.floor(Date.now() / MILLISECONDS_PER_SECOND - timestampSeconds),
  );
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const match = RELATIVE_TIME_UNITS.find(
    ({ seconds }) => ageSeconds >= seconds,
  );
  if (!match) return format.format(-ageSeconds, "second");
  return format.format(-Math.floor(ageSeconds / match.seconds), match.unit);
}

/**
 * Formats a timestamp as a medium date with a short time in the given
 * language (e.g. 'Oct 24, 2026, 1:05 PM', '2026/10/24 13:05').
 * @param timestampMs - Milliseconds since the epoch.
 * @param locale - BCP 47 language tag, usually i18n.language.
 * @returns The formatted date and time.
 */
function formatDateTime(timestampMs: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestampMs);
}

/**
 * Determines whether a Unix timestamp expressed in seconds falls within the
 * last 24 hours relative to now.
 * @param {any} timestampSeconds - The Unix timestamp in seconds.
 * @returns {any} True when the timestamp is newer than 24 hours ago.
 */
function isWithinLastDay(timestampSeconds: number): boolean {
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
    return false;
  }

  const date = new Date(timestampSeconds * MILLISECONDS_PER_SECOND);
  return isAfter(date, subDays(new Date(), 1));
}

export { formatElapsed, formatAge, formatDateTime, isWithinLastDay };
