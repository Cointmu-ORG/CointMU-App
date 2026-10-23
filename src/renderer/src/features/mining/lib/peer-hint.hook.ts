import { useEffect, useState } from "react";
import type { NodePeerHint } from "@bridge/types";
import { getPeerHint, subscribePeerHint } from "../api/peer-hint.service";

/**
 * Tracks why the node has no peers, as reported by the main-process watchdog.
 * Hydrates on mount and follows later changes.
 * @returns The i18n key of the current hint, or null when there is none.
 */
function usePeerHintKey(): string | null {
  const [hint, setHint] = useState<NodePeerHint | null>(null);

  useEffect(() => {
    let isMounted = true;
    getPeerHint()
      .then((initial) => {
        if (isMounted) setHint((current) => current ?? initial);
      })
      .catch((err: unknown) => {
        console.error("[peer-hint] Failed to load peer hint", err);
      });
    const unsubscribe = subscribePeerHint(setHint);
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return hint ? `mining:peerHint.${hint}` : null;
}

export { usePeerHintKey };
