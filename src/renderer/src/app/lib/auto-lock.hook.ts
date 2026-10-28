import { useEffect } from "react";
import { useAppStore } from "@/shared/model";
import { useSecurityStore } from "@/features/settings";
import ms from "ms";

export const INACTIVITY_TIMEOUT_MS = ms("5m");

/**
 * Tracks user activity (mouse, keyboard, touch, scroll) and automatically
 * triggers the provided onLock callback if the user is inactive for 5 minutes.
 * The timer is paused automatically if the node is currently mining or if the
 * autoLock setting is disabled.
 * @param {() => void} onLock - The callback to execute when the session expires.
 * @param {boolean} isActive - Whether the auto-lock tracker should be currently running (e.g., wallet is unlocked).
 */
export function useAutoLock(onLock: () => void, isActive: boolean): void {
  useEffect(() => {
    // If not active (e.g. at onboarding/login screen), do nothing.
    if (!isActive) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimer = (): void => {
      clearTimeout(timeoutId);

      // Fetch latest states from stores directly so we don't need to re-bind
      // the event listeners every time the state changes.
      const autoLock = useSecurityStore.getState().settings.autoLock;
      const isMining = useAppStore.getState().isMining;

      // If auto-lock is disabled or mining is active, do not set the timer
      if (!autoLock || isMining) {
        return;
      }

      timeoutId = setTimeout(() => {
        onLock();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
    ];
    const handleActivity = (): void => resetTimer();

    events.forEach((event) => {
      document.addEventListener(event, handleActivity);
    });

    // Subscribe to store changes so the timer resets/pauses immediately
    // when the user toggles autoLock or starts/stops mining.
    const unsubscribeSecurity = useSecurityStore.subscribe(() => {
      resetTimer();
    });
    const unsubscribeApp = useAppStore.subscribe((state, prevState) => {
      if (state.isMining !== prevState.isMining) {
        resetTimer();
      }
    });

    // Initial setup
    resetTimer();

    return (): void => {
      clearTimeout(timeoutId);
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
      unsubscribeSecurity();
      unsubscribeApp();
    };
  }, [onLock, isActive]);
}
