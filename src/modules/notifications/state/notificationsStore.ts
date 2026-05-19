import type { NotificationItem } from '@/modules/notifications/hooks/useRealtimeNotifications';

type NotificationsSnapshot = {
  notifications: NotificationItem[];
  unreadCount: number;
  toastMessage: string | null;
};

type Listener = (snapshot: NotificationsSnapshot) => void;

let notifications: NotificationItem[] = [];
let unreadCount = 0;
let toastMessage: string | null = null;
// Set para evitar notificaciones duplicadas por mismo evento (clave: userId|auctionId|message)
const seenNotificationKeys = new Set<string>();
const listeners = new Set<Listener>();

function snapshot(): NotificationsSnapshot {
  return {
    notifications,
    unreadCount,
    toastMessage,
  };
}

function notifyAll() {
  const current = snapshot();
  listeners.forEach((listener) => listener(current));
}

export function subscribeNotifications(listener: Listener) {
  listeners.add(listener);
  listener(snapshot());

  return () => {
    listeners.delete(listener);
  };
}

export function addNotification(next: NotificationItem) {
  // Dedupe por notificationId primero
  if (notifications.some((item) => item.notificationId === next.notificationId)) {
    return;
  }
  // If this notification relates to an auction, remove any previous notification for same auctionId
  if (next.auctionId !== null && next.auctionId !== undefined) {
    notifications = notifications.filter((item) => item.auctionId !== next.auctionId);
    // Also clear seen keys that reference that auctionId
    for (const k of Array.from(seenNotificationKeys)) {
      if (k.includes(`|${next.auctionId}|`)) {
        seenNotificationKeys.delete(k);
      }
    }
  }

  // Dedupe adicional por clave compuesta (evita duplicados que vengan con distintos ids)
  const fullKey = `${next.userId ?? 0}|${next.auctionId ?? 'null'}|${(next.message ?? '').trim()}`;
  const messageOnlyKey = `|${next.auctionId ?? 'null'}|${(next.message ?? '').trim()}`;

  if (seenNotificationKeys.has(fullKey) || seenNotificationKeys.has(messageOnlyKey)) {
    return;
  }

  // Registrar ambas variantes para cubrir cases donde el author/userId no venga consistente
  seenNotificationKeys.add(fullKey);
  seenNotificationKeys.add(messageOnlyKey);

  notifications = [next, ...notifications].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
  unreadCount += 1;
  toastMessage = next.message;
  notifyAll();
}

export function clearUnreadNotifications() {
  unreadCount = 0;
  notifyAll();
}

export function clearToastMessage() {
  toastMessage = null;
  notifyAll();
}
