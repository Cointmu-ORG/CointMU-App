import { type JSX } from "react";

/**
 * Base skeleton element with a subtle pulse animation and soft background.
 * @param props - className to allow custom sizing and positioning.
 * @returns The rendered base skeleton element.
 */
export function Skeleton({
  className = "",
}: {
  className?: string;
}): JSX.Element {
  return (
    <div
      className={`animate-pulse bg-slate-200 dark:bg-gray-800 rounded ${className}`}
    />
  );
}

/**
 * Skeleton placeholder mimicking a KPI card layout (e.g., Dashboard stats).
 * @returns The rendered skeleton card.
 */
export function SkeletonCard(): JSX.Element {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="w-7 h-7 rounded-lg" />
          <Skeleton className="w-24 h-4" />
        </div>
        <Skeleton className="w-10 h-4" />
      </div>
      <Skeleton className="w-20 h-8 mt-1" />
      <Skeleton className="w-32 h-3 mt-2" />
    </div>
  );
}

/**
 * Skeleton placeholder mimicking a list of activity items.
 * @param props - itemCount allows specifying how many rows to render.
 * @returns The rendered skeleton list.
 */
export function SkeletonList({
  itemCount = 5,
}: {
  itemCount?: number;
}): JSX.Element {
  return (
    <div className="divide-y divide-slate-100 dark:divide-gray-800">
      {Array.from({ length: itemCount }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-4 bg-white dark:bg-transparent"
        >
          <div className="flex items-center gap-4">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div>
              <Skeleton className="w-32 h-4 mb-1.5" />
              <Skeleton className="w-48 h-3" />
            </div>
          </div>
          <div className="flex flex-col items-end">
            <Skeleton className="w-20 h-4 mb-1.5" />
            <Skeleton className="w-24 h-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton placeholder mimicking a data table with multiple columns.
 * @param props - rowCount specifies the number of rows, columns specifies the number of columns.
 * @returns The rendered skeleton table.
 */
export function SkeletonTable({
  rowCount = 5,
  columns = 4,
}: {
  rowCount?: number;
  columns?: number;
}): JSX.Element {
  return (
    <div className="w-full">
      <div className="flex w-full border-b border-slate-100 px-5 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={`th-${i}`} className="flex-1 flex items-center">
            <Skeleton className={`w-16 h-3 ${i === 0 ? "" : "ml-auto"}`} />
          </div>
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rowCount }).map((_, r) => (
          <div
            key={`tr-${r}`}
            className="flex w-full px-5 py-4 hover:bg-slate-50/50 transition-colors"
          >
            {Array.from({ length: columns }).map((_, c) => (
              <div key={`td-${c}`} className="flex-1 flex items-center">
                {c === 0 ? (
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                    <div>
                      <Skeleton className="w-24 h-4 mb-1.5" />
                      <Skeleton className="w-12 h-3" />
                    </div>
                  </div>
                ) : (
                  <Skeleton
                    className={`w-20 h-4 ${c === 0 ? "" : "ml-auto"}`}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
