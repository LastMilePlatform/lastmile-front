import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  connectRealtime,
  joinRealtimeRoom,
  leaveRealtimeRoom,
  onRealtime,
} from '@/services/realtime/realtimeService';
import {
  addNotification as addNotificationToStore,
  clearToastMessage,
  clearUnreadNotifications,
  subscribeNotifications,
} from '@/modules/notifications/state/notificationsStore';
import { getEvents } from '@/services/api/eventsService';

type RealtimeNotificationPayload = {
  id?: number;
  notificationId?: number;
  userId?: number;
  message: string;
  auctionId: number | null;
  read?: boolean;
  createdAt?: string;
  notification?: RealtimeNotificationPayload;
  data?: RealtimeNotificationPayload;
};

type RealtimeChatMessagePayload = {
  id?: number;
  campaignId?: number;
  authorId?: number;
  authorName?: string;
  message?: string;
  createdAt?: string;
};

type RealtimeEventCreatedPayload = {
  id?: number;
  eventId?: number;
  name?: string;
  city?: string;
  createdAt?: string;
  data?: RealtimeEventCreatedPayload;
  event?: RealtimeEventCreatedPayload;
};

export type NotificationItem = {
  notificationId: number;
  userId: number;
  message: string;
  auctionId: number | null;
  createdAt: string;
};

type UseRealtimeNotificationsArgs = {
  userId?: number;
  role?: string;
  token?: string;
};

function normalizeNotification(payload: RealtimeNotificationPayload): NotificationItem {
  const fallbackId = Date.now();

  return {
    notificationId: Number(payload.notificationId ?? payload.id ?? fallbackId),
    userId: Number(payload.userId ?? 0),
    message: String(payload.message ?? ''),
    auctionId: payload.auctionId ?? null,
    createdAt: payload.createdAt ?? new Date().toISOString(),
  };
}

function unwrapNotificationPayload(payload: RealtimeNotificationPayload): RealtimeNotificationPayload {
  if (payload.notification) {
    return payload.notification;
  }

  if (payload.data) {
    return payload.data;
  }

  return payload;
}

function unwrapEventPayload(payload: RealtimeEventCreatedPayload): RealtimeEventCreatedPayload {
  if (payload.data) {
    return payload.data;
  }

  if (payload.event) {
    return payload.event;
  }

  return payload;
}

function translateNotificationMessage(rawMessage: string | undefined, auctionId: number | null) {
  const msg = String(rawMessage ?? '').trim();
  const lower = msg.toLowerCase();

  // Auction-specific translations
  if (auctionId !== null) {
    const winPattern = /\b(won|you won|winner|won the auction|has won)\b/;
    const losePattern = /\b(lost|you lost|lost the auction|outbid|has been outbid|you have been outbid)\b/;

    if (winPattern.test(lower)) return 'Ganaste';
    if (losePattern.test(lower)) return 'Perdiste';

    // Generic auction/bid notifications
    if (/\bbid\b|\bnew bid\b|placed a bid\b/.test(lower)) return 'Nueva puja';
    if (/\bauction\b|\bnew auction\b/.test(lower)) return 'Subasta';
  }

  // General translations
  if (/\bnew event\b|created a new event|has been created/.test(lower)) return 'Se ha creado un nuevo evento';
  if (/\bnew message\b|new message in|message in campaign/.test(lower)) return msg.replace(/new message in campaign #?\d+:?\s*/i, '').trim() || 'Nuevo mensaje';
  if (/\boutbid\b|you have been outbid/.test(lower)) return 'Has sido superado';

  // If message already in Spanish or not recognized, return original trimmed
  return msg;
}

function buildCanonicalChatMessageFromPayload(rawPayload: RealtimeNotificationPayload | RealtimeChatMessagePayload) {
  // Try to extract author, campaign name/id and body from different payload shapes.
  const asChat = rawPayload as RealtimeChatMessagePayload;
  const asNotif = rawPayload as RealtimeNotificationPayload;

  const authorName = (asChat.authorName && asChat.authorName.trim()) || '';
  const campaignId = (asChat.campaignId ?? (asNotif as any)?.campaignId) ?? null;
  // Attempt to extract campaign name from notification payload message like "Nuevo mensaje en campaña 'Food Drive'"
  let campaignName: string | null = null;
  if (typeof asNotif?.message === 'string') {
    const m = asNotif.message.match(/campaña\s+["“']?([^"'”]+)["'”]?/i);
    if (m && m[1]) campaignName = m[1].trim();
    const m2 = asNotif.message.match(/campaign\s+["“']?([^"'”]+)["'”]?/i);
    if (!campaignName && m2 && m2[1]) campaignName = m2[1].trim();
  }

  // Body: for chat payload prefer asChat.message; otherwise try to strip known prefixes from asNotif.message
  let body = (asChat.message ?? '') as string;
  if (!body && typeof asNotif?.message === 'string') {
    // Remove prefixes like "Nuevo mensaje en campaña 'X' de Y:" or "New message in campaign 'X' from Y:"
    const stripped = asNotif.message.replace(/^(nuevo mensaje en campaña[^:]*:\s*)/i, '')
      .replace(/^(new message in campaign[^:]*:\s*)/i, '')
      .replace(/^(nuevo mensaje[^:]*de[^:]*:\s*)/i, '')
      .replace(/^(new message[^:]*from[^:]*:\s*)/i, '');
    body = stripped.trim();
  }

  const author = authorName || (asNotif?.userId ? `Usuario ${asNotif.userId}` : 'Un usuario');
  const campaignLabel = campaignName ?? (campaignId ? `campaña #${campaignId}` : 'la campaña');

  // Final canonical string
  return `Nuevo mensaje de ${author} en ${campaignLabel}: ${body}`.trim();
}

export function useRealtimeNotifications({ userId, role, token }: UseRealtimeNotificationsArgs) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const hasEventsSnapshotRef = useRef(false);
  const knownEventIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    return subscribeNotifications((nextSnapshot) => {
      setNotifications(nextSnapshot.notifications);
      setUnreadCount(nextSnapshot.unreadCount);
      setToastMessage(nextSnapshot.toastMessage);
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    clearUnreadNotifications();
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    // Reuse the singleton connection and ensure it exists before subscribing.
    connectRealtime({ userId, role, token });
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[notifications] suscripcion activa para currentUserId', userId);
    }

    const rooms = [
      `user:${userId}`,
      `user:${userId}:notifications`,
      `notifications:${userId}`,
    ];

    rooms.forEach((room) => joinRealtimeRoom(room));

    const offNotification = onRealtime<RealtimeNotificationPayload>('notification.new', (payload) => {
      if (!payload) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log('[notifications] notification.new sin payload');
        }
        return;
      }

      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[notifications] notification.new payload crudo', payload);
      }

      const normalizedPayload = unwrapNotificationPayload(payload);

      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[notifications] notification.new payload normalizado', normalizedPayload);
      }

      // If backend includes userId, enforce match. If not, accept and show it.
      if (normalizedPayload.userId !== undefined && Number(normalizedPayload.userId) !== userId) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log('[notifications] descartada por userId', {
            payloadUserId: normalizedPayload.userId,
            currentUserId: userId,
          });
        }
        return;
      }

      let nextNotification = normalizeNotification(normalizedPayload);

      // Si es una notificación relacionada con subasta, construir mensaje canónico
      if (normalizedPayload.auctionId !== undefined && normalizedPayload.auctionId !== null) {
        const auctionId = normalizedPayload.auctionId as number;
        // Intentar extraer información útil del payload
        const winnerId = (normalizedPayload as any).winnerId ?? normalizedPayload.userId ?? (payload as any).winnerId ?? null;
        const finalPriceRaw = (normalizedPayload as any).finalPrice ?? (normalizedPayload as any).price ?? (normalizedPayload as any).currentPrice ?? (payload as any).finalPrice ?? null;

        // Intentar extraer nombre de la subasta del mensaje (si viene)
        let auctionName: string | null = null;
        const rawMsg = String(normalizedPayload.message ?? (payload as any).message ?? '').trim();
        const mName = rawMsg.match(/subasta\s+(?:n[oº]*\s*)?["“']?([^"'”\n:]+)["'”]?/i) || rawMsg.match(/auction\s+(?:n[oº]*\s*)?["“']?([^"'”\n:]+)["'”]?/i);
        if (mName && mName[1]) auctionName = mName[1].trim();

        const isWinner = winnerId !== null && Number(winnerId) === Number(userId);

        if (isWinner) {
          const priceText = finalPriceRaw ? ` Precio final: ${String(finalPriceRaw)}` : '';
          nextNotification.message = `Ganaste la subasta${auctionName ? ` por ${auctionName}` : ` #${auctionId}`}${priceText} — ¡Felicidades!`;
        } else {
          nextNotification.message = `Perdiste la subasta${auctionName ? ` por ${auctionName}` : ` #${auctionId}`}. Sigue intentando.`;
        }

        // Establecer notificationId basado en auctionId para facilitar dedupe/global uniqueness
        nextNotification.notificationId = Number(`9${String(auctionId)}`) || nextNotification.notificationId;
        nextNotification.auctionId = auctionId;
      }

      // Si parece una notificación de chat (backend pudo haber enviado notification.new además de chat.message.created),
      // construimos un mensaje canónico para que coincida con la notificación generada por el evento de chat.
      const isChatLike = Boolean(
        // payload original puede contener datos adicionales
        (payload as any)?.campaignId || /nuevo mensaje|new message/i.test(String((payload as any)?.message ?? ''))
      );

      if (isChatLike) {
        const canonical = buildCanonicalChatMessageFromPayload(payload as RealtimeNotificationPayload);
        nextNotification.message = canonical;
        // intentar setear userId si viene en payload
        if ((payload as any)?.authorId) {
          nextNotification.userId = Number((payload as any).authorId);
        }
      } else {
        // Traducir/normalizar mensajes que provengan en inglés u otros formatos.
        nextNotification.message = translateNotificationMessage(nextNotification.message, nextNotification.auctionId ?? null);
      }

      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[notifications] aceptada y agregada', nextNotification);
      }
      addNotificationToStore(nextNotification);
    });

    const offChatMessageCreated = onRealtime<RealtimeChatMessagePayload>('chat.message.created', (payload) => {
      if (!payload?.message || !payload.campaignId) {
        return;
      }

      if (payload.authorId !== undefined && Number(payload.authorId) === userId) {
        return;
      }

      const canonical = buildCanonicalChatMessageFromPayload(payload as RealtimeChatMessagePayload);
      const chatNotification: NotificationItem = {
        notificationId: Number(payload.id ?? Date.now()),
        userId: Number(payload.authorId ?? 0),
        // Mensaje canónico: "Nuevo mensaje de (Usuario) en (campaña): (cuerpo)"
        message: canonical,
        auctionId: null,
        createdAt: payload.createdAt ?? new Date().toISOString(),
      };

      addNotificationToStore(chatNotification);
    });

    const offEventCreated = onRealtime<RealtimeEventCreatedPayload>('event.created', (payload) => {
      if (role !== 'donor' || !payload) {
        return;
      }

      const eventPayload = unwrapEventPayload(payload);
      const eventId = Number(eventPayload.eventId ?? eventPayload.id ?? 0);
      const eventCity = eventPayload.city?.trim() || 'una nueva ciudad';
      const eventName = eventPayload.name?.trim();

      addNotificationToStore({
        notificationId: eventId > 0 ? 2_000_000 + eventId : Date.now(),
        userId,
        message: eventName
          ? `Se ha creado un nuevo evento en ${eventCity}: ${eventName}`
          : `Se ha creado un nuevo evento en ${eventCity}`,
        auctionId: null,
        createdAt: eventPayload.createdAt ?? new Date().toISOString(),
      });
    });

    const offEventNew = onRealtime<RealtimeEventCreatedPayload>('event.new', (payload) => {
      if (role !== 'donor' || !payload) {
        return;
      }

      const eventPayload = unwrapEventPayload(payload);
      const eventId = Number(eventPayload.eventId ?? eventPayload.id ?? 0);
      const eventCity = eventPayload.city?.trim() || 'una nueva ciudad';
      const eventName = eventPayload.name?.trim();

      addNotificationToStore({
        notificationId: eventId > 0 ? 2_000_000 + eventId : Date.now(),
        userId,
        message: eventName
          ? `Se ha creado un nuevo evento en ${eventCity}: ${eventName}`
          : `Se ha creado un nuevo evento en ${eventCity}`,
        auctionId: null,
        createdAt: eventPayload.createdAt ?? new Date().toISOString(),
      });
    });

    return () => {
      offNotification();
      offChatMessageCreated();
      offEventCreated();
      offEventNew();
      rooms.forEach((room) => leaveRealtimeRoom(room));
    };
  }, [role, token, userId]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = setTimeout(() => {
      clearToastMessage();
    }, 2600);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  useEffect(() => {
    if (!userId || role !== 'donor') {
      return;
    }

    let isMounted = true;

    const syncEvents = async (notifyChanges: boolean) => {
      try {
        const response = await getEvents({ page: 1, limit: 100 });
        const nextEvents = response.data;
        const nextEventIds = new Set(nextEvents.map((eventItem) => eventItem.id));

        if (!isMounted) {
          return;
        }

        if (!hasEventsSnapshotRef.current) {
          hasEventsSnapshotRef.current = true;
          knownEventIdsRef.current = nextEventIds;
          return;
        }

        if (notifyChanges) {
          nextEvents.forEach((eventItem) => {
            if (knownEventIdsRef.current.has(eventItem.id)) {
              return;
            }

            addNotificationToStore({
              notificationId: 2_000_000 + eventItem.id,
              userId,
              message: `Se ha creado un nuevo evento en ${eventItem.city}: ${eventItem.name}`,
              auctionId: null,
              createdAt: new Date().toISOString(),
            });
          });
        }

        knownEventIdsRef.current = nextEventIds;
      } catch {
        // Keep current snapshot when events cannot be fetched.
      }
    };

    void syncEvents(false);

    const pollingId = setInterval(() => {
      void syncEvents(true);
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(pollingId);
    };
  }, [role, userId]);

  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      ),
    [notifications]
  );

  return {
    notifications: sortedNotifications,
    unreadCount,
    toastMessage,
    markAllAsRead,
  };
}
