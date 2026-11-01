import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSetting, setSetting } = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));
vi.mock("@/shared/api", () => ({ getSetting, setSetting }));

import {
  MAX_NOTIFICATIONS,
  NOTIFICATIONS_HISTORY_KEY,
  NOTIFICATIONS_SETTINGS_KEY,
} from "../config/notification-storage.constants";
import { dispatchNotification } from "../api/notification.service";
import { useNotificationStore } from "./notification.store";

const INITIAL_STATE = useNotificationStore.getState();
const NOTE = { type: "info", title: "t", message: "m" } as const;

beforeEach(() => {
  useNotificationStore.setState(INITIAL_STATE, true);
  getSetting.mockReset();
  setSetting.mockReset().mockResolvedValue(undefined);
});

describe("notification store", () => {
  it("adds new notifications first, unread, and persists the history", () => {
    const { addNotification } = useNotificationStore.getState();

    const first = addNotification(NOTE);
    const second = addNotification({ ...NOTE, title: "second" });

    const { notifications } = useNotificationStore.getState();
    expect(notifications.map((n) => n.id)).toEqual([second.id, first.id]);
    expect(first.isRead).toBe(false);
    expect(setSetting).toHaveBeenLastCalledWith(
      NOTIFICATIONS_HISTORY_KEY,
      notifications,
    );
  });

  it(`keeps at most ${MAX_NOTIFICATIONS} notifications`, () => {
    const { addNotification } = useNotificationStore.getState();

    for (let i = 0; i <= MAX_NOTIFICATIONS; i++) addNotification(NOTE);

    expect(useNotificationStore.getState().notifications).toHaveLength(
      MAX_NOTIFICATIONS,
    );
  });

  it("marks one or all notifications as read", () => {
    const { addNotification, markAsRead, markAllAsRead } =
      useNotificationStore.getState();
    const a = addNotification(NOTE);
    addNotification(NOTE);

    markAsRead(a.id);
    const afterOne = useNotificationStore.getState().notifications;
    markAllAsRead();

    expect(afterOne.map((n) => n.isRead)).toEqual([false, true]);
    expect(
      useNotificationStore.getState().notifications.every((n) => n.isRead),
    ).toBe(true);
  });

  it("clears the history", () => {
    useNotificationStore.getState().addNotification(NOTE);

    useNotificationStore.getState().clearAll();

    expect(useNotificationStore.getState().notifications).toEqual([]);
    expect(setSetting).toHaveBeenLastCalledWith(NOTIFICATIONS_HISTORY_KEY, []);
  });

  it("hydrates stored settings over the defaults, once", async () => {
    getSetting.mockImplementation(async (key: string) =>
      key === NOTIFICATIONS_SETTINGS_KEY ? { sound: true } : "not an array",
    );

    await useNotificationStore.getState().hydrate();
    await useNotificationStore.getState().hydrate();

    const state = useNotificationStore.getState();
    expect(state.settings.sound).toBe(true);
    expect(state.settings.global).toBe(true);
    expect(state.notifications).toEqual([]);
    expect(state.hydrated).toBe(true);
    expect(getSetting).toHaveBeenCalledTimes(2);
  });

  it("still counts as hydrated when reading the store fails", async () => {
    getSetting.mockRejectedValue(new Error("ipc down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await useNotificationStore.getState().hydrate();

    expect(useNotificationStore.getState().hydrated).toBe(true);
  });

  it("persists merged settings", () => {
    useNotificationStore.getState().updateSettings({ mining: false });

    expect(setSetting).toHaveBeenCalledWith(
      NOTIFICATIONS_SETTINGS_KEY,
      expect.objectContaining({ mining: false, global: true }),
    );
  });
});

describe("dispatchNotification", () => {
  const quiet = { desktopOs: false, sound: false };

  it("records a notification when its category is on", () => {
    useNotificationStore.getState().updateSettings(quiet);

    dispatchNotification("mining", "Block found", "#42");

    const [item] = useNotificationStore.getState().notifications;
    expect(item).toMatchObject({ type: "mining", title: "Block found" });
  });

  it.each([
    ["the global switch is off", { global: false }, "info"],
    ["its category is off", { transactions: false }, "transaction"],
  ] as const)("records nothing when %s", (_, settings, type) => {
    useNotificationStore.getState().updateSettings({ ...quiet, ...settings });

    dispatchNotification(type, "t", "m");

    expect(useNotificationStore.getState().notifications).toEqual([]);
  });

  it("lets info through whatever the category toggles say", () => {
    useNotificationStore.getState().updateSettings({
      ...quiet,
      transactions: false,
      mining: false,
      security: false,
    });

    dispatchNotification("info", "t", "m");

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });
});
