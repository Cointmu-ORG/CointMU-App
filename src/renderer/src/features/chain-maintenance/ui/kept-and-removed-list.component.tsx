import type { JSX } from "react";

interface KeptAndRemovedListProps {
  readonly removedTitle: string;
  readonly removed: readonly string[];
  readonly keptTitle: string;
  readonly kept: readonly string[];
}

/**
 * The two lists a destructive confirmation shows: what goes, what stays.
 * Labelled in text, not only by colour.
 * @returns Both lists.
 */
export function KeptAndRemovedList({
  removedTitle,
  removed,
  keptTitle,
  kept,
}: KeptAndRemovedListProps): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <p className="font-semibold text-red-600 dark:text-red-400">
          {removedTitle}
        </p>
        <ul className="list-disc ps-5">
          {removed.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-semibold text-emerald-700 dark:text-emerald-400">
          {keptTitle}
        </p>
        <ul className="list-disc ps-5">
          {kept.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
