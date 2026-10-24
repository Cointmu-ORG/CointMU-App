import { NOTIFICATION_COLORS_BY_TYPE } from "../config/notification.constants";
import { type JSX, useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatAge } from "@/shared/lib";
import {
  useNotificationStore,
  type NotificationItem,
} from "../model/notification.store";
import { Bell } from "lucide-react";

const MS_PER_SECOND = 1000;

interface NotificationRowProps {
  notification: NotificationItem;
  onSelect: (id: string) => void;
}

/**
 * A single notification row in the center list. Unread rows carry a tinted
 * background and a leading colored dot, and selecting one marks it read.
 * @param props - The notification item and the select handler.
 * @returns The rendered notification row.
 */
function NotificationRow({
  notification,
  onSelect,
}: NotificationRowProps): JSX.Element {
  const { i18n } = useTranslation();
  return (
    <button
      onClick={() => onSelect(notification.id)}
      className={`w-full flex items-start gap-3 p-3 text-left transition-colors ${
        notification.isRead
          ? "bg-white dark:bg-gray-900 hover:bg-slate-50 dark:hover:bg-gray-800"
          : "bg-blue-50/60 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-gray-700"
      }`}
    >
      <span
        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${NOTIFICATION_COLORS_BY_TYPE[notification.type]}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-800 dark:text-white truncate">
            {notification.title}
          </p>
          {!notification.isRead && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5 break-words">
          {notification.message}
        </p>
        <p className="text-[10px] text-slate-400 dark:text-gray-400 mt-1">
          {formatAge(notification.timestamp / MS_PER_SECOND, i18n.language)}
        </p>
      </div>
    </button>
  );
}

/**
 * Notification center trigger and popover. Renders a bell button with an unread
 * count badge; clicking it opens a downward dropdown listing the persisted
 * notification history with mark-all-read and clear-all actions. Uses an
 * outside-click handler to close, matching the existing sidebar popover pattern.
 * @returns The notification center control.
 */
export function NotificationCenter(): JSX.Element {
  const { t } = useTranslation();
  const notifications = useNotificationStore((s) => s.notifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const clearAll = useNotificationStore((s) => s.clearAll);

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-300 transition-colors focus:outline-none"
        aria-label={t("common:notifications.title")}
      >
        <Bell width={18} height={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-full top-0 ml-4 w-80 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-left overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-gray-800">
            <p className="text-sm font-bold text-slate-800 dark:text-white">
              {t("common:notifications.title")}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => markAllAsRead()}
                disabled={unreadCount === 0}
                className="text-[11px] font-semibold text-accent hover:opacity-80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t("common:notifications.markAllRead")}
              </button>
              <button
                onClick={() => clearAll()}
                disabled={notifications.length === 0}
                className="text-[11px] font-semibold text-accent hover:opacity-80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t("common:notifications.clearAll")}
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-gray-800">
            {notifications.length > 0 ? (
              notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onSelect={markAsRead}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell
                  className="text-slate-300 dark:text-gray-600 mb-2"
                  width={28}
                  height={28}
                  strokeWidth={1.5}
                />
                <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
                  {t("common:notifications.empty")}
                </p>
                <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">
                  {t("common:notifications.emptyHint")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
