import {
  useNotificationStore,
  type NotificationType,
} from "../model/notification.store";

/**
 * Maps a notification type to its governing category toggle. The generic 'info'
 * type has no category gate and is controlled solely by the global switch.
 * @param type - The notification type being dispatched.
 * @param settings - The current notification settings.
 * @returns True when the category for this type is enabled.
 */
function isCategoryEnabled(
  type: NotificationType,
  settings: { transactions: boolean; mining: boolean; security: boolean },
): boolean {
  if (type === "transaction") return settings.transactions;
  if (type === "mining") return settings.mining;
  if (type === "security") return settings.security;
  return true;
}

/**
 * Fires a native desktop notification when permission allows, requesting it once
 * if still in the default state. All failures are swallowed so a denied or
 * unsupported environment never interrupts the in-app flow.
 * @param title - The notification title.
 * @param message - The notification body text.
 * @returns Nothing.
 */
function fireDesktopNotification(title: string, message: string): void {
  if (typeof Notification === "undefined") return;
  try {
    if (Notification.permission === "granted") {
      new Notification(title, { body: message });
    } else if (Notification.permission !== "denied") {
      void Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification(title, { body: message });
        }
      });
    }
  } catch (err) {
    console.error("Failed to show desktop notification", err);
  }
}

/**
 * Plays a short, asset-free confirmation tone via the Web Audio API. Best-effort
 * only; any failure (no audio context, autoplay policy) is ignored.
 * @returns Nothing.
 */
function playNotificationSound(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.26);
    oscillator.onended = (): void => {
      void ctx.close();
    };
  } catch (err) {
    console.error("Failed to play notification sound", err);
  }
}

/**
 * Central entry point for emitting a notification. Honors the global switch and
 * the per-category toggle, records the notification in the persisted history,
 * and delivers it through enabled channels: a native desktop notification when
 * desktopOs is on, an in-app toast when the window is focused, and an optional
 * sound. Returns early without recording anything when notifications are muted.
 * @param type - The notification category type.
 * @param title - The notification title.
 * @param message - The notification body text.
 * @param metaData - Optional structured payload associated with the event.
 * @returns Nothing.
 */
export function dispatchNotification(
  type: NotificationType,
  title: string,
  message: string,
  metaData?: Record<string, unknown>,
): void {
  const { settings, addNotification, pushToast } =
    useNotificationStore.getState();

  if (!settings.global) return;
  if (!isCategoryEnabled(type, settings)) return;

  const item = addNotification({ type, title, message, metaData });

  if (settings.desktopOs) {
    fireDesktopNotification(title, message);
  }

  if (typeof document !== "undefined" && document.hasFocus()) {
    pushToast(item);
  }

  if (settings.sound) {
    playNotificationSound();
  }
}
