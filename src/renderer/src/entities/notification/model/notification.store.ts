import {
  MAX_NOTIFICATIONS,
  NOTIFICATIONS_SETTINGS_KEY,
  NOTIFICATIONS_HISTORY_KEY,
} from "../config/notification.constants";
import { create } from "zustand";
import { getSetting, setSetting } from "@/shared/api";

export type NotificationType = "transaction" | "mining" | "security" | "info";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  isRead: boolean;
  metaData?: Record<string, unknown>;
}

export interface NotificationSettings {
  global: boolean;
  transactions: boolean;
  mining: boolean;
  security: boolean;
  desktopOs: boolean;
  sound: boolean;
}

interface AddNotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  metaData?: Record<string, unknown>;
}

interface NotificationStore {
  notifications: NotificationItem[];
  settings: NotificationSettings;
  toasts: NotificationItem[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addNotification: (payload: AddNotificationPayload) => NotificationItem;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  updateSettings: (newSettings: Partial<NotificationSettings>) => void;
  pushToast: (item: NotificationItem) => void;
  dismissToast: (id: string) => void;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  global: true,
  transactions: true,
  mining: true,
  security: true,
  desktopOs: true,
  sound: false,
};

/**
 * Generates a unique identifier for a notification, preferring the native
 * crypto UUID generator and falling back to a timestamp-random composite.
 * @returns A unique string identifier.
 */
function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Persists the notification history to electron-store, swallowing write errors
 * so a storage failure never breaks the in-memory notification flow.
 * @param notifications - The current notification history to persist.
 * @returns Nothing.
 */
function persistHistory(notifications: NotificationItem[]): void {
  void setSetting(NOTIFICATIONS_HISTORY_KEY, notifications).catch((err) => {
    console.error("Failed to persist notification history", err);
  });
}

/**
 * Global notification store holding the persisted history and user preferences
 * alongside a transient toast queue. History and settings are mirrored to
 * electron-store on every mutation; toasts are intentionally in-memory only.
 */
export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  settings: DEFAULT_SETTINGS,
  toasts: [],
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const [storedSettings, storedHistory] = await Promise.all([
        getSetting<Partial<NotificationSettings> | null>(
          NOTIFICATIONS_SETTINGS_KEY,
        ),
        getSetting<NotificationItem[] | null>(NOTIFICATIONS_HISTORY_KEY),
      ]);
      set({
        settings: { ...DEFAULT_SETTINGS, ...(storedSettings ?? {}) },
        notifications: Array.isArray(storedHistory) ? storedHistory : [],
        hydrated: true,
      });
    } catch (err) {
      console.error("Failed to hydrate notification store", err);
      set({ hydrated: true });
    }
  },
  addNotification: (payload: AddNotificationPayload) => {
    const item: NotificationItem = {
      id: createId(),
      type: payload.type,
      title: payload.title,
      message: payload.message,
      timestamp: Date.now(),
      isRead: false,
      metaData: payload.metaData,
    };
    set((state) => {
      const notifications = [item, ...state.notifications].slice(
        0,
        MAX_NOTIFICATIONS,
      );
      persistHistory(notifications);
      return { notifications };
    });
    return item;
  },
  markAsRead: (id: string) => {
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n,
      );
      persistHistory(notifications);
      return { notifications };
    });
  },
  markAllAsRead: () => {
    set((state) => {
      const notifications = state.notifications.map((n) => ({
        ...n,
        isRead: true,
      }));
      persistHistory(notifications);
      return { notifications };
    });
  },
  clearAll: () => {
    persistHistory([]);
    set({ notifications: [] });
  },
  updateSettings: (newSettings: Partial<NotificationSettings>) => {
    set((state) => {
      const settings = { ...state.settings, ...newSettings };
      void setSetting(NOTIFICATIONS_SETTINGS_KEY, settings).catch((err) => {
        console.error("Failed to persist notification settings", err);
      });
      return { settings };
    });
  },
  pushToast: (item: NotificationItem) => {
    set((state) => ({ toasts: [...state.toasts, item] }));
  },
  dismissToast: (id: string) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
