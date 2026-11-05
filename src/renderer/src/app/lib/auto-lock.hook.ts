import { useEffect } from "react";
import { useSecurityStore } from "@/features/settings";
const MS_PER_MINUTE = 60_000;

/**
 * Tracks user activity (mouse, keyboard, touch, scroll) and automatically
 * triggers the provided onLock callback after the idle minutes chosen in
 * Settings → Security (security.autoLockMinutes), also while the node mines:
 * mining needs only the coinbase address, never the wallet's keys, and keeps
 * running after the lock. The timer never runs when the choice is Never (0).
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

      // Auto-lock set to Never: no timer.
      if (!minutes) {
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

    // Subscribe to store changes so the timer restarts immediately when the
    // user changes the auto-lock time.
    const unsubscribeSecurity = useSecurityStore.subscribe(() => {
      resetTimer();
    });

    // Initial setup
    resetTimer();

    return (): void => {
      clearTimeout(timeoutId);
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
      unsubscribeSecurity();
    };
  }, [onLock, isActive]);
}
