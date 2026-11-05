import { useCallback, useEffect, useRef, useState } from "react";
import type { BootnodeStatus } from "@bridge/types";
import { probeBootnodes } from "../api/bootnode.service";

/** Re-check interval while the Network pane is open; nothing runs when it is closed. */
export const NODE_STATUS_POLL_MS = 15_000;

export interface BootnodeStatusHook {
  /** The last result per enode; missing until first checked. */
  readonly statuses: ReadonlyMap<string, BootnodeStatus>;
  /** Enodes with a check in flight. */
  readonly checking: ReadonlySet<string>;
  readonly checkAll: () => Promise<void>;
  readonly checkNode: (enode: string) => Promise<void>;
}

/**
 * Checks each listed node (TCP reachability with latency, and whether the
 * local node is peered with it) when the component mounts, when the list
 * changes, and every NODE_STATUS_POLL_MS until it unmounts.
 * @param enodes - The listed nodes.
 * @returns The statuses and the manual check actions.
 */
export function useBootnodeStatus(
  enodes: readonly string[],
): BootnodeStatusHook {
  const [statuses, setStatuses] = useState<ReadonlyMap<string, BootnodeStatus>>(
    new Map(),
  );
  const [checking, setChecking] = useState<ReadonlySet<string>>(new Set());
  const isMounted = useRef(true);

  const run = useCallback(
    async (targets: readonly string[], enode?: string) => {
      setChecking((current) => new Set([...current, ...targets]));
      try {
        const results = await probeBootnodes(enode);
        if (!isMounted.current) return;
        setStatuses((current) => {
          const next = new Map(current);
          results.forEach((status) => next.set(status.enode, status));
          return next;
        });
      } catch (err) {
        console.error("[bootnode] Node check failed", err);
      } finally {
        if (isMounted.current) {
          setChecking((current) => {
            const next = new Set(current);
            targets.forEach((target) => next.delete(target));
            return next;
          });
        }
      }
    },
    [],
  );

  const listKey = enodes.join(",");
  const checkAll = useCallback(
    () => run(listKey === "" ? [] : listKey.split(",")),
    [run, listKey],
  );
  const checkNode = useCallback((enode: string) => run([enode], enode), [run]);

  useEffect(() => {
    isMounted.current = true;
    if (listKey === "") return undefined;
    // From a timer, not the effect body: the check sets state right away.
    const first = setTimeout(() => void checkAll());
    const timer = setInterval(() => void checkAll(), NODE_STATUS_POLL_MS);
    return (): void => {
      isMounted.current = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [checkAll, listKey]);

  return { statuses, checking, checkAll, checkNode };
}
