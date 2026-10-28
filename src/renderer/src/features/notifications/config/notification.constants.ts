import { type NotificationType } from "@/entities/notification";

export const TOAST_DURATION_MS = 5000;

export const NOTIFICATION_COLORS_BY_TYPE: Record<NotificationType, string> = {
  transaction: "bg-blue-500",
  mining: "bg-emerald-500",
  security: "bg-red-500",
  info: "bg-slate-400",
};
