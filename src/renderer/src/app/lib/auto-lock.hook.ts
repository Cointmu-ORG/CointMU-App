import { useEffect } from "react";
import { useAppStore } from "@/shared/model";
import { useSecurityStore } from "@/features/settings";
const MS_PER_MINUTE = 60_000;

/**
 * Tracks user activity (mouse, keyboard, touch, scroll) and automatically
 * triggers the provided onLock callback after the idle minutes chosen in
 * Settings → Security (security.autoLockMinutes). The timer is paused while
 * the node is mining, and never runs when the choice is Never (0).
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
      const minutes = useSecurityStore.getState().settings.autoLockMinutes;
      const isMining = useAppStore.getState().isMining;

      // If auto-lock is set to Never or mining is active, do not set the timer
      if (!minutes || isMining) {
        return;
      }

      timeoutId = setTimeout(() => {
        onLock();
      }, minutes * MS_PER_MINUTE);
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
    // when the user changes the auto-lock time or starts/stops mining.
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
