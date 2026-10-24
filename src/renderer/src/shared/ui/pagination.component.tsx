import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Compact previous/next pagination control with a page indicator. Renders
 * nothing when there is at most a single page. The page bounds are enforced by
 * the parent via the onPageChange handler.
 * @param props - The current page, total page count, and change handler.
 * @returns The rendered pagination control, or null when unnecessary.
 */
function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps): JSX.Element | null {
  const { t } = useTranslation();
  if (totalPages <= 1) {
    return null;
  }

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  return (
    <div className="flex items-center justify-between pt-3">
      <span className="text-[10px] font-medium text-slate-400">
        {t("common:pagination.pageOf", {
          current: currentPage,
          total: totalPages,
        })}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canPrev}
          aria-label={t("common:pagination.previous")}
          className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft width={14} height={14} strokeWidth={2.5} />
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canNext}
          aria-label={t("common:pagination.next")}
          className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight width={14} height={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

export { Pagination };
export type { PaginationProps };
