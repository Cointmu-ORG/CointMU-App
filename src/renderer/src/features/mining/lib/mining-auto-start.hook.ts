import { useEffect, useState } from "react";
import { MiningAutoStartPhase, type MiningAutoStartState } from "@bridge/types";
import { subscribeAutoStart } from "../api/auto-start.service";

const TICK_MS = 1_000;
const MS_PER_SECOND = 1_000;

/**
 * @param state - The auto-start state.
 * @param now - Epoch ms.
 * @returns Whole seconds until mining starts, or null when not counting down.
 */
export function secondsUntilStart(
  state: MiningAutoStartState | null,
  now: number,
): number | null {
  if (state?.phase !== MiningAutoStartPhase.COUNTDOWN) return null;
  if (state.startsAt === null) return null;
  return Math.max(0, Math.ceil((state.startsAt - now) / MS_PER_SECOND));
}

/**
 * @returns Seconds until "Start mining at launch" starts mining, updated
 *   every second, or null while it is not counting down.
 */
export function useMiningAutoStartCountdown(): number | null {
  const [state, setState] = useState<MiningAutoStartState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(
    () =>
      subscribeAutoStart((next) => {
        setState(next);
        setNow(Date.now());
      }),
    [],
  );

  const isCounting = state?.phase === MiningAutoStartPhase.COUNTDOWN;
  useEffect(() => {
    if (!isCounting) return undefined;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [isCounting]);

  return secondsUntilStart(state, now);
}
