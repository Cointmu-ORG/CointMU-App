import { useState, useEffect } from "react";
import ms from "ms";
import { formatElapsed } from "./time.util";

const TICK_INTERVAL_MS = ms("1s");
const IDLE_LABEL = "--";

/**
 * Hook that produces a live-updating elapsed-time label derived from a start
 * timestamp. It ticks once per second while active and resets to a placeholder
 * when idle or when no start time is set.
 * @param startTime - The epoch milliseconds when timing began, or null.
 * @param active - Whether the timer should currently be running.
 * @returns The formatted elapsed duration string.
 */
function useTimer(startTime: number | null, active: boolean): string {
  const [label, setLabel] = useState<string>(IDLE_LABEL);

  useEffect(() => {
    if (startTime === null || !active) {
      setLabel(IDLE_LABEL);
      return;
    }

    const update = (): void => setLabel(formatElapsed(Date.now() - startTime));
    update();
    const intervalId = setInterval(update, TICK_INTERVAL_MS);

    return (): void => clearInterval(intervalId);
  }, [startTime, active]);

  return label;
}

export { useTimer };
