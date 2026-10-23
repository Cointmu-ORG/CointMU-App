import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO, getDay } from "date-fns";
import { type ActivityContribution } from "../api/activity.service";
import {
  HEATMAP_INTENSITY_LEGEND,
  HEATMAP_HALF_YEAR_LENGTH,
} from "../config/mining.constants";

interface ActivityHeatmapProps {
  contributions: ActivityContribution[];
}

/**
 * Maps a day's total activity (validated blocks plus mining operations) to a
 * Tailwind background class, mirroring a GitHub-style contribution scale.
 * @param total - The combined activity count for the day.
 * @returns The Tailwind background class for the cell.
 */
function intensityClass(total: number): string {
  if (total <= 0) return HEATMAP_INTENSITY_LEGEND[0];
  if (total <= 3) return HEATMAP_INTENSITY_LEGEND[1];
  if (total <= 8) return HEATMAP_INTENSITY_LEGEND[2];
  return HEATMAP_INTENSITY_LEGEND[3];
}

interface ContributionCellProps {
  contribution: ActivityContribution;
}

/**
 * A single heatmap cell with a custom hover tooltip showing the date, validated
 * blocks, and mining operations for that day.
 * @param props - The contribution record for this cell.
 * @returns The rendered cell with its tooltip.
 */
function ContributionCell({
  contribution,
}: ContributionCellProps): JSX.Element {
  const { t } = useTranslation();
  const total = contribution.blocksValidated + contribution.miningOperations;
  const label = format(parseISO(contribution.date), "MMM d, yyyy");

  return (
    <div className="relative group">
      <div className={`w-3 h-3 rounded-sm ${intensityClass(total)}`} />
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-[10px] text-white shadow-lg">
        <p className="font-bold">{label}</p>
        <p className="text-slate-300">
          {contribution.blocksValidated} {t("mining:activity.blocksValidated")}
        </p>
        <p className="text-slate-300">
          {contribution.miningOperations}{" "}
          {t("mining:activity.miningOperations")}
        </p>
      </div>
    </div>
  );
}

interface HeatmapGridProps {
  chunk: ActivityContribution[];
}

/**
 * Renders one GitHub-style grid half: seven weekday rows flowing into week
 * columns, with the first column padded so the rows align to real calendar days
 * for this chunk's starting date.
 * @param props - The contribution slice for this grid half.
 * @returns The rendered grid half.
 */
function HeatmapGrid({ chunk }: HeatmapGridProps): JSX.Element {
  const leadingPad = chunk.length > 0 ? getDay(parseISO(chunk[0].date)) : 0;
  const cells: (ActivityContribution | null)[] = [
    ...Array<null>(leadingPad).fill(null),
    ...chunk,
  ];

  return (
    <div className="grid grid-flow-col auto-cols-[0.75rem] grid-rows-[repeat(7,0.75rem)] gap-1 w-max">
      {cells.map((cell, index) =>
        cell === null ? (
          <div key={`pad-${index}`} className="w-3 h-3" />
        ) : (
          <ContributionCell key={cell.date} contribution={cell} />
        ),
      )}
    </div>
  );
}

/**
 * GitHub-style contribution heatmap rendering a full year of mining and
 * validation activity split into two stacked six-month grids. Each grid lays
 * days out in seven weekday rows flowing into week columns, color-coded by total
 * daily activity, with a custom hover tooltip per cell. The scroll container is
 * top-padded so upward tooltips are never clipped by its overflow boundary.
 * @param props - The daily contribution series (expects up to 365 entries).
 * @returns The rendered contribution heatmap.
 */
export function ActivityHeatmap({
  contributions,
}: ActivityHeatmapProps): JSX.Element {
  const { t } = useTranslation();
  const firstHalf = contributions.slice(0, HEATMAP_HALF_YEAR_LENGTH);
  const secondHalf = contributions.slice(HEATMAP_HALF_YEAR_LENGTH);

  return (
    <div>
      <div className="overflow-x-auto pt-16 pb-1">
        <div className="flex flex-col gap-6 w-max">
          <HeatmapGrid chunk={firstHalf} />
          <HeatmapGrid chunk={secondHalf} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] font-medium text-slate-400">
        <span>{t("mining:activity.less")}</span>
        {HEATMAP_INTENSITY_LEGEND.map((cls) => (
          <div key={cls} className={`w-3 h-3 rounded-sm ${cls}`} />
        ))}
        <span>{t("mining:activity.more")}</span>
      </div>
    </div>
  );
}
