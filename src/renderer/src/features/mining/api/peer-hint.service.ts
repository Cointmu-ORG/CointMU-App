import type { NodePeerHint } from "@bridge/types";

type Unsubscribe = () => void;

/**
 * Subscribes to peer hint changes broadcast by the main process.
 * @param callback - Invoked with every new hint, or null when it clears.
 * @returns A function that removes the subscription.
 */
function subscribePeerHint(
  callback: (hint: NodePeerHint | null) => void,
): Unsubscribe {
  return window.api.node.onPeerHint(callback);
}

/**
 * Fetches the current peer hint, so a view mounted after the broadcast still
 * shows it.
 * @returns The current hint, or null.
 */
async function getPeerHint(): Promise<NodePeerHint | null> {
  return window.api.node.getPeerHint();
}

export { subscribePeerHint, getPeerHint };
