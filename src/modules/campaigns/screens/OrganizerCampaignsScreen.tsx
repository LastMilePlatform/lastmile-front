import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesome5 } from '@expo/vector-icons';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';
import { CampaignChatModal } from '@/modules/campaigns/components/CampaignChatModal';
import {
  buildInventoryMap,
  ChatMessage,
  ChatMessageCreatedEvent,
  CampaignFundsRealtimeEvent,
  formatMoney,
  getErrorMessage,
  InventoryRealtimeEvent,
  normalizeCollection,
  PHYSICAL_DONATION_OPTIONS,
} from '@/modules/campaigns/utils/campaignsShared';
import { NotificationsBell } from '@/modules/notifications/components/NotificationsBell';
import { useRealtimeNotifications } from '@/modules/notifications/hooks/useRealtimeNotifications';
import { addNotification } from '@/modules/notifications/state/notificationsStore';
import {
  OrganizerBottomTabs,
  ORGANIZER_WEB_PANEL_OFFSET,
} from '@/modules/organizer/components/OrganizerBottomTabs';
import { type Campaign, createCampaign, getCampaigns } from '@/services/api/campaignsService';
import { getItemDonations, type ItemDonationResponse } from '@/services/api/donationsService';
import { type EventSummary, getEvents } from '@/services/api/eventsService';
import {
  connectRealtime,
  emitChatSend,
  joinRealtimeRoom,
  leaveRealtimeRoom,
  onChatMessageCreated,
  onRealtime,
} from '@/services/realtime/realtimeService';
import { getUsers, type UserSummary } from '@/services/api/usersService';

const DEFAULT_CREATED_BY = 1;

export function OrganizerCampaignsScreen() {
  const organizerWebInset = Platform.OS === 'web' ? ORGANIZER_WEB_PANEL_OFFSET : 0;
  const isWeb = Platform.OS === 'web';
  const isMobileLayout = !isWeb;
  const { width } = useWindowDimensions();
  const { currentUser } = useAuthSession();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [itemDonations, setItemDonations] = useState<ItemDonationResponse[]>([]);

  const [organizerBuyerId, setOrganizerBuyerId] = useState<number>(DEFAULT_CREATED_BY);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [campaignName, setCampaignName] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [goalMoney, setGoalMoney] = useState('0');
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [chatCampaignId, setChatCampaignId] = useState<number | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [chatByCampaign, setChatByCampaign] = useState<Record<number, ChatMessage[]>>({});
  const hasCampaignSnapshot = useRef(false);
  const notifiedCreatedCampaignIds = useRef<Set<number>>(new Set());
  const notifiedClosedCampaignIds = useRef<Set<number>>(new Set());

  const getProgress = useCallback((campaign: Campaign) => {
    if (!campaign.goalMoney || campaign.goalMoney <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((campaign.collectedMoney / campaign.goalMoney) * 100));
  }, []);

  const syncCampaigns = useCallback(
    (nextCampaigns: Campaign[], notifyChanges = true) => {
      setCampaigns((prevCampaigns) => {
        if (!hasCampaignSnapshot.current) {
          hasCampaignSnapshot.current = true;
          return nextCampaigns;
        }

        if (!notifyChanges) {
          return nextCampaigns;
        }

        const previousById = new Map(prevCampaigns.map((campaign) => [campaign.id, campaign]));

        nextCampaigns.forEach((campaign) => {
          const previous = previousById.get(campaign.id);

          if (!previous) {
            if (notifiedCreatedCampaignIds.current.has(campaign.id)) {
              return;
            }

            notifiedCreatedCampaignIds.current.add(campaign.id);
            addNotification({
              notificationId: 3_000_000 + campaign.id,
              userId: currentUser?.id ?? 0,
              message: `Nueva campaña creada: ${campaign.name}`,
              auctionId: null,
              createdAt: new Date().toISOString(),
            });
            return;
          }

          const previousProgress = getProgress(previous);
          const currentProgress = getProgress(campaign);

          if (previousProgress < 100 && currentProgress >= 100) {
            if (notifiedClosedCampaignIds.current.has(campaign.id)) {
              return;
            }

            notifiedClosedCampaignIds.current.add(campaign.id);
            addNotification({
              notificationId: 4_000_000 + campaign.id,
              userId: currentUser?.id ?? 0,
              message: `Campaña cerrada por meta alcanzada: ${campaign.name}`,
              auctionId: null,
              createdAt: new Date().toISOString(),
            });
          }
        });

        return nextCampaigns;
      });
    },
    [currentUser?.id, getProgress]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const [eventsResult, campaignsResult, usersResult, itemsResult] = await Promise.allSettled([
      getEvents(),
      getCampaigns(),
      getUsers(1, 100),
      getItemDonations(1, 100),
    ]);

    const failedSources: string[] = [];

    if (eventsResult.status === 'fulfilled') {
      setEvents(eventsResult.value.data);
      setSelectedEventId(eventsResult.value.data[0]?.id ?? null);
    } else {
      failedSources.push(`eventos (${getErrorMessage(eventsResult.reason)})`);
      setEvents([]);
      setSelectedEventId(null);
    }

    if (campaignsResult.status === 'fulfilled') {
      syncCampaigns(campaignsResult.value.data, false);
    } else {
      failedSources.push(`campanas (${getErrorMessage(campaignsResult.reason)})`);
      syncCampaigns([], false);
    }

    if (usersResult.status === 'fulfilled') {
      setUsers(usersResult.value.data);
    } else {
      failedSources.push(`usuarios (${getErrorMessage(usersResult.reason)})`);
      setUsers([]);
    }

    if (itemsResult.status === 'fulfilled') {
      setItemDonations(normalizeCollection<ItemDonationResponse>(itemsResult.value));
    } else {
      failedSources.push(`inventario (${getErrorMessage(itemsResult.reason)})`);
      setItemDonations([]);
    }

    if (failedSources.length > 0) {
      setLoadError(`Fallo la carga de: ${failedSources.join(' | ')}`);
    }

    setIsLoading(false);
  }, [syncCampaigns]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const matchedByEmail = users.find(
      (userItem) => userItem.email.toLowerCase() === currentUser.email.toLowerCase()
    );

    if (matchedByEmail) {
      setOrganizerBuyerId(matchedByEmail.id);
      return;
    }

    const fallbackOrganizer = users.find((userItem) => userItem.role === 'organizer');
    setOrganizerBuyerId(fallbackOrganizer?.id ?? DEFAULT_CREATED_BY);
  }, [currentUser, users]);

  const eventsById = useMemo(
    () => new Map(events.map((eventItem) => [eventItem.id, eventItem])),
    [events]
  );

  const inventoryByCampaign = useMemo(() => buildInventoryMap(itemDonations), [itemDonations]);

  const chatCampaign = useMemo(
    () => campaigns.find((campaignItem) => campaignItem.id === chatCampaignId) ?? null,
    [campaigns, chatCampaignId]
  );

  const campaignTotals = useMemo(() => {
    const totalCollected = campaigns.reduce((sum, campaignItem) => sum + campaignItem.collectedMoney, 0);
    const totalGoal = campaigns.reduce((sum, campaignItem) => sum + campaignItem.goalMoney, 0);
    const closedCount = campaigns.filter((campaignItem) => getProgress(campaignItem) >= 100).length;

    return {
      totalCollected,
      totalGoal,
      closedCount,
    };
  }, [campaigns, getProgress]);

  const webGridGap = 12;

  const webContentWidth = useMemo(() => {
    if (!isWeb) {
      return width;
    }

    return Math.max(980, width - organizerWebInset - 44);
  }, [isWeb, organizerWebInset, width]);

  const webCampaignColumns = useMemo(() => {
    if (!isWeb) {
      return 1;
    }

    return 3;
  }, [isWeb, webContentWidth]);

  const campaignCardWidth = useMemo(() => {
    if (!isWeb) {
      return undefined;
    }

    const available = webContentWidth - webGridGap * (webCampaignColumns - 1);
    return Math.max(300, Math.floor(available / webCampaignColumns));
  }, [isWeb, webCampaignColumns, webContentWidth]);

  const chatMessages = chatCampaignId ? chatByCampaign[chatCampaignId] ?? [] : [];
  const { notifications, unreadCount, toastMessage, markAllAsRead } = useRealtimeNotifications({
    userId: currentUser?.id,
    role: currentUser?.role,
    token: currentUser?.accessToken,
  });

  const refreshCampaigns = useCallback(async () => {
    try {
      const campaignsResult = await getCampaigns();

      syncCampaigns(campaignsResult.data, true);
    } catch {
      // Keep the last visible snapshot when the refresh fails.
    }
  }, [syncCampaigns]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    connectRealtime({
      userId: organizerBuyerId,
      role: currentUser.role,
      token: currentUser.accessToken,
    });

    const campaignIds = campaigns.map((campaign) => campaign.id);
    const rooms = campaignIds.flatMap((campaignId) => [
      `campaign:${campaignId}:chat`,
      `campaign:${campaignId}:inventory`,
    ]);

    rooms.forEach((room) => joinRealtimeRoom(room));

    const offChatMessageCreated = onChatMessageCreated<ChatMessageCreatedEvent>((event) => {
      if (!event?.campaignId || !event.message) {
        return;
      }

      setChatByCampaign((prev) => {
        const bucket = prev[event.campaignId] ?? [];
        const nextId = String(event.id ?? `ws-${Date.now()}`);

        if (bucket.some((item) => item.id === nextId)) {
          return prev;
        }

        const normalizedIncomingMessage = event.message.trim().toLowerCase();
        const optimisticIndex = bucket.findIndex((item) => {
          const isOptimistic = String(item.id).startsWith('local-');
          if (!isOptimistic) {
            return false;
          }

          return item.message.trim().toLowerCase() === normalizedIncomingMessage;
        });

        if (optimisticIndex >= 0) {
          const nextBucket = [...bucket];
          nextBucket[optimisticIndex] = {
            id: nextId,
            author: event.authorName ?? `Usuario ${event.authorId ?? ''}`.trim(),
            message: event.message,
            createdAt: event.createdAt
              ? new Date(event.createdAt).toLocaleTimeString('es-CO', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : nextBucket[optimisticIndex].createdAt,
          };

          return {
            ...prev,
            [event.campaignId]: nextBucket,
          };
        }

        return {
          ...prev,
          [event.campaignId]: [
            ...bucket,
            {
              id: nextId,
              author: event.authorName ?? `Usuario ${event.authorId ?? ''}`.trim(),
              message: event.message,
              createdAt: event.createdAt
                ? new Date(event.createdAt).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : new Date().toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
            },
          ],
        };
      });
    });

    const offInventoryUpdated = onRealtime<InventoryRealtimeEvent>('campaign.inventory.updated', async (event) => {
      if (!event?.campaignId) {
        return;
      }

      try {
        const itemsResponse = await getItemDonations(1, 100);
        setItemDonations(normalizeCollection<ItemDonationResponse>(itemsResponse));
      } catch {
        // Keep last snapshot if refresh fails.
      }
    });

    const offCampaignFundsUpdated = onRealtime<CampaignFundsRealtimeEvent>(
      'campaign.money.updated',
      async (event) => {
        if (!event?.campaignId) {
          return;
        }

        await refreshCampaigns();
      }
    );

    const offDonationCreated = onRealtime<CampaignFundsRealtimeEvent>('donation.money.created', async (event) => {
      if (!event?.campaignId) {
        return;
      }

      await refreshCampaigns();
    });

    const offCampaignUpdated = onRealtime<CampaignFundsRealtimeEvent>('campaign.updated', async (event) => {
      if (!event?.campaignId) {
        return;
      }

      await refreshCampaigns();
    });

    const offCampaignCreated = onRealtime<CampaignFundsRealtimeEvent>('campaign.created', async () => {
      await refreshCampaigns();
    });

    const offCampaignNew = onRealtime<CampaignFundsRealtimeEvent>('campaign.new', async () => {
      await refreshCampaigns();
    });

    const offCampaignClosed = onRealtime<CampaignFundsRealtimeEvent>('campaign.closed', async () => {
      await refreshCampaigns();
    });

    const refreshTimer = setInterval(() => {
      void refreshCampaigns();
    }, 15000);

    return () => {
      offChatMessageCreated();
      offInventoryUpdated();
      offCampaignFundsUpdated();
      offDonationCreated();
      offCampaignUpdated();
      offCampaignCreated();
      offCampaignNew();
      offCampaignClosed();
      clearInterval(refreshTimer);
      rooms.forEach((room) => leaveRealtimeRoom(room));
    };
  }, [campaigns, currentUser, organizerBuyerId, refreshCampaigns]);

  const canCreate = campaignName.trim().length >= 3 && Boolean(selectedEventId) && !isSubmitting;

  const handleOpenCreate = () => {
    setFormError(null);
    setIsCreateOpen(true);
  };

  const handleSubmitCampaign = async () => {
    if (!selectedEventId) {
      setFormError('Debes tener al menos un evento creado para registrar una campana.');
      return;
    }

    if (campaignName.trim().length < 3) {
      setFormError('El nombre de la campana debe tener al menos 3 caracteres.');
      return;
    }

    const parsedGoalMoney = Number(goalMoney.replaceAll(/\D/g, '')) || 0;
    const selectedEvent = eventsById.get(selectedEventId);

    setIsSubmitting(true);
    setFormError(null);

    try {
      const createdCampaign = await createCampaign({
        name: campaignName.trim(),
        description: campaignDescription.trim() || 'Campana humanitaria',
        campaignType: 'mixed',
        goalMoney: parsedGoalMoney,
        eventId: selectedEventId,
        createdBy: selectedEvent?.createdBy ?? DEFAULT_CREATED_BY,
      });

      setCampaigns((prev) => [createdCampaign, ...prev]);
      void refreshCampaigns();
      setCampaignName('');
      setCampaignDescription('');
      setGoalMoney('0');
      setIsCreateOpen(false);
    } catch (error) {
      setFormError(`No se pudo crear la campana. ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openChat = (campaignId: number) => {
    setChatCampaignId(campaignId);
    setChatDraft('');
  };

  const handleSendChat = () => {
    if (!chatCampaignId || chatDraft.trim().length < 1) {
      return;
    }

    const trimmedMessage = chatDraft.trim();

    const optimisticMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      author: currentUser?.email ?? 'Organizador',
      message: trimmedMessage,
      createdAt: new Date().toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setChatByCampaign((prev) => ({
      ...prev,
      [chatCampaignId]: [...(prev[chatCampaignId] ?? []), optimisticMessage],
    }));

    emitChatSend({
      campaignId: Number(chatCampaignId),
      message: trimmedMessage,
    });

    setChatDraft('');
  };

  return (
    <SafeAreaView className='flex-1 bg-[#eef4ff]'>
      <View className='flex-1' style={{ paddingLeft: organizerWebInset }}>
      <View
        className='relative flex-1 px-4 pt-4'
        style={
          isWeb
            ? {
                alignSelf: 'center',
                width: '100%',
                maxWidth: 1760,
                paddingHorizontal: 16,
                paddingTop: 18,
              }
            : undefined
        }
      >
        <View className='mb-1 flex-row items-center justify-between'>
          <View className='flex-row items-center'>
            <View
              style={{
                backgroundColor: '#dce8ff',
                borderRadius: 16,
                padding: 12,
                marginRight: 12,
              }}
            >
              <FontAwesome5 color='#1e73fa' name='bullhorn' size={22} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#111f3c' }}>Campañas</Text>
          </View>

          <View className='relative'>
            <NotificationsBell
              notifications={notifications}
              onMarkAllAsRead={markAllAsRead}
              toastMessage={toastMessage}
              unreadCount={unreadCount}
            />
          </View>
        </View>

        <Text className='text-2xl font-extrabold text-[#16325d]'>Campañas Activas</Text>
        <Text className='mt-1 text-sm text-[#4d648a]'>
          Campañas creadas por organizadores para apoyar las misiones.
        </Text>

        <View className='mt-3 flex-row items-center justify-between'>
          <Text className='text-sm font-semibold text-[#2a456e]'>Total: {campaigns.length}</Text>
          {isWeb ? (
            <Pressable
              className='rounded-xl bg-[#1f5fe0] px-5 py-3 active:opacity-90'
              onPress={handleOpenCreate}
              style={{
                shadowColor: '#1f5fe0',
                shadowOpacity: 0.22,
                shadowOffset: { width: 0, height: 8 },
                shadowRadius: 14,
                elevation: 6,
              }}
            >
              <Text className='text-center text-sm font-extrabold tracking-[0.2px] text-white'>
                Crear campaña
              </Text>
            </Pressable>
          ) : null}
        </View>

        {isMobileLayout ? (
          <Pressable
            className='mt-3 rounded-2xl bg-[#1f5fe0] px-5 py-4 active:opacity-90'
            onPress={handleOpenCreate}
            style={{
              shadowColor: '#1f5fe0',
              shadowOpacity: 0.25,
              shadowOffset: { width: 0, height: 8 },
              shadowRadius: 14,
              elevation: 6,
            }}
          >
            <Text className='text-center text-base font-extrabold tracking-[0.3px] text-white'>
              Crear campaña
            </Text>
          </Pressable>
        ) : null}

        {isWeb ? (
          <View className='mt-4 flex-row gap-3'>
            <View className='flex-[1.6] rounded-2xl border border-[#d8e6ff] bg-white px-5 py-4'>
              <Text className='text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5f7da7]'>
                Total posible al cierre
              </Text>
              <Text className='mt-1 text-4xl font-extrabold text-[#13274d]'>
                {campaignTotals.totalGoal.toLocaleString('es-CO')}
                <Text className='text-xl font-semibold text-[#8ea4c6]'> COP</Text>
              </Text>
              <Text className='mt-2 text-xs font-semibold text-[#6d82a5]'>
                Meta acumulada si todas las campañas llegan a cerrarse.
              </Text>
            </View>
            <View className='flex-[1] rounded-2xl bg-[#1f5fe0] px-5 py-4'>
              <Text className='text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c8dcff]'>
                Total recaudado
              </Text>
              <Text className='mt-1 text-3xl font-extrabold text-white'>
                {formatMoney(campaignTotals.totalCollected)}
              </Text>
              <Text className='mt-2 text-xs font-semibold text-[#d6e6ff]'>
                {campaignTotals.closedCount} campañas ya cerradas por meta alcanzada
              </Text>
            </View>
          </View>
        ) : null}

        {isLoading ? (
          <View className='mt-6 items-center'>
            <ActivityIndicator color='#1f5fe0' size='small' />
          </View>
        ) : null}

        {loadError ? (
          <Text className='mt-4 rounded-xl bg-[#ffecef] px-3 py-2 text-sm text-[#9f2238]'>
            {loadError}
          </Text>
        ) : null}

        {!isLoading && events.length === 0 ? (
          <Text className='mt-4 rounded-xl bg-[#fff6e8] px-3 py-2 text-sm text-[#8a5d13]'>
            No hay eventos creados. Debes crear un evento para poder registrar campanas.
          </Text>
        ) : null}

        <ScrollView
          className='mt-4'
          contentContainerStyle={{
            gap: webGridGap,
            paddingBottom: Platform.OS === 'web' ? 24 : 120,
            ...(isWeb
              ? {
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  width: '100%',
                }
              : null),
          }}
        >
          {campaigns.map((campaignItem, index) => {
            const eventInfo = eventsById.get(campaignItem.eventId);
            const progress =
              campaignItem.goalMoney > 0
                ? Math.min(100, Math.round((campaignItem.collectedMoney / campaignItem.goalMoney) * 100))
                : 0;
            const isClosed = progress >= 100;

            const inventory = inventoryByCampaign[campaignItem.id] ?? {};
            const physicalInventorySummary = PHYSICAL_DONATION_OPTIONS.map((option) => ({
              label: option.label,
              quantity: inventory[option.key] ?? 0,
            })).filter((entry) => entry.quantity > 0);

            return (
              <Animated.View
                className='relative overflow-hidden rounded-2xl border border-[#d8e6ff] bg-white p-4'
                entering={FadeInUp.delay(index * 45).duration(240)}
                key={campaignItem.id}
                style={
                  isWeb
                    ? {
                        flexGrow: 1,
                        flexBasis: 0,
                        minWidth: campaignCardWidth,
                        minHeight: 300,
                        shadowColor: '#163457',
                        shadowOpacity: 0.08,
                        shadowOffset: { width: 0, height: 6 },
                        shadowRadius: 14,
                        elevation: 4,
                      }
                    : undefined
                }
              >
                {isClosed ? (
                  <View className='absolute inset-0 z-10 items-center justify-center bg-[#6b7280cc] px-4'>
                    <View className='w-full rounded-2xl border border-white/20 bg-white px-4 py-4 shadow-lg'>
                      <Text className='text-center text-[11px] font-bold uppercase tracking-[1.6px] text-[#0f7a46]'>
                        Campaña cerrada
                      </Text>
                      <Text className='mt-1 text-center text-lg font-extrabold text-[#16325d]'>
                        Meta alcanzada
                      </Text>
                      <Text className='mt-2 text-center text-sm font-semibold text-[#1f4fa7]'>
                        Recaudado: {formatMoney(campaignItem.collectedMoney)}
                      </Text>
                      <Text className='mt-2 text-center text-sm text-[#4d648a]'>
                        Esta campaña llegó al $100\%$ de su objetivo y quedó cerrada para nuevos aportes.
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View className={isClosed ? 'opacity-30' : ''}>
                  <View className='flex-row items-start justify-between'>
                  <View className='flex-1 pr-3'>
                    <Text className='text-base font-extrabold text-[#1b3259]'>{campaignItem.name}</Text>
                    <Text className='mt-1 text-xs text-[#5d7399]'>
                      Evento: {eventInfo ? `${eventInfo.name} (${eventInfo.city})` : `ID ${campaignItem.eventId}`}
                    </Text>
                  </View>

                  <Pressable
                    className='h-10 w-10 items-center justify-center rounded-full bg-[#1f5fe0]'
                    onPress={() => openChat(campaignItem.id)}
                  >
                    <Text className='text-[10px] font-bold text-white'>Chat</Text>
                  </Pressable>
                  </View>

                  <View className='mt-3 flex-row gap-2'>
                    <View className='flex-1 rounded-xl bg-[#edf3ff] p-3'>
                      <Text className='text-xs font-semibold text-[#4b648d]'>Fondos</Text>
                      <Text className='mt-1 text-sm font-extrabold text-[#1f4fa7]'>
                        {formatMoney(campaignItem.collectedMoney)}
                      </Text>
                    </View>
                    <View className='flex-1 rounded-xl bg-[#ebfff1] p-3'>
                      <Text className='text-xs font-semibold text-[#4b648d]'>Meta</Text>
                      <Text className='mt-1 text-sm font-extrabold text-[#1b7b45]'>
                        {formatMoney(campaignItem.goalMoney)}
                      </Text>
                    </View>
                  </View>

                  <View className='mt-3 h-2 overflow-hidden rounded-full bg-[#e4ecfb]'>
                    <View className='h-full rounded-full bg-[#1f5fe0]' style={{ width: `${Math.max(6, progress)}%` }} />
                  </View>

                  {isClosed ? (
                    <Text className='mt-3 text-xs font-semibold text-[#4b648d]'>
                      El estado se marcó automáticamente al alcanzar la meta.
                    </Text>
                  ) : (
                    <Text className='mt-3 text-xs font-semibold text-[#4b648d]'>
                      Aún está activa y sigue recibiendo apoyo.
                    </Text>
                  )}

                  <View className='mt-3 rounded-xl bg-[#edf3ff] p-3'>
                    <Text className='text-xs font-semibold text-[#27436d]'>Elementos donados</Text>
                    {physicalInventorySummary.length === 0 ? (
                      <Text className='mt-1 text-xs text-[#5d7399]'>Aun no hay elementos donados.</Text>
                    ) : (
                      <Text className='mt-1 text-xs text-[#1f365d]'>
                        {physicalInventorySummary.map((entry) => `${entry.label}: ${entry.quantity}`).join(' | ')}
                      </Text>
                    )}
                  </View>
                </View>
              </Animated.View>
            );
          })}

          {!isLoading && campaigns.length === 0 ? (
            <Text className='text-sm text-[#5d7498]'>Aun no hay campanas creadas.</Text>
          ) : null}
        </ScrollView>
      </View>
      </View>

      <Modal animationType='slide' transparent visible={isCreateOpen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className='flex-1'>
          <View className='flex-1 justify-end bg-[#07163166]'>
            <View className='max-h-[88%] rounded-t-3xl bg-white px-5 pt-5'>
              <ScrollView
                contentContainerStyle={{ paddingBottom: 28 }}
                keyboardShouldPersistTaps='handled'
                showsVerticalScrollIndicator={false}
              >
                <Text className='text-lg font-extrabold text-[#17315c]'>Crear campaña</Text>

                <Text className='mt-4 text-sm font-semibold text-[#27436d]'>Nombre</Text>
                <TextInput
                  className='mt-1 rounded-xl border border-[#d3e2fb] bg-[#f8fbff] px-4 py-3 text-[#18335f]'
                  onChangeText={setCampaignName}
                  placeholder='Ej: Kits de ayuda para inundaciones'
                  placeholderTextColor='#8ea6c8'
                  value={campaignName}
                />

                <Text className='mt-3 text-sm font-semibold text-[#27436d]'>Descripcion</Text>
                <TextInput
                  className='mt-1 rounded-xl border border-[#d3e2fb] bg-[#f8fbff] px-4 py-3 text-[#18335f]'
                  onChangeText={setCampaignDescription}
                  placeholder='Describe el objetivo de la campana'
                  placeholderTextColor='#8ea6c8'
                  value={campaignDescription}
                />

                <Text className='mt-3 text-sm font-semibold text-[#27436d]'>Meta de fondos (COP)</Text>
                <TextInput
                  className='mt-1 rounded-xl border border-[#d3e2fb] bg-[#f8fbff] px-4 py-3 text-[#18335f]'
                  keyboardType='number-pad'
                  onChangeText={setGoalMoney}
                  placeholder='0'
                  placeholderTextColor='#8ea6c8'
                  value={goalMoney}
                />

                <Text className='mt-3 text-sm font-semibold text-[#27436d]'>Evento asociado</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className='mt-2'>
                  <View className='flex-row gap-2'>
                    {events.map((eventItem) => {
                      const isSelected = selectedEventId === eventItem.id;

                      return (
                        <Pressable
                          className={`rounded-full border px-4 py-2 ${
                            isSelected ? 'border-[#1f5fe0] bg-[#e8f0ff]' : 'border-[#d6e3fb] bg-white'
                          }`}
                          key={eventItem.id}
                          onPress={() => setSelectedEventId(eventItem.id)}
                        >
                          <Text
                            className={`text-xs font-semibold ${
                              isSelected ? 'text-[#1f4fb6]' : 'text-[#4a6083]'
                            }`}
                          >
                            {eventItem.name} - {eventItem.city}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                {events.length === 0 ? (
                  <Text className='mt-3 rounded-xl bg-[#fff6e8] px-3 py-2 text-xs text-[#8a5d13]'>
                    No hay eventos creados. Sin evento no se puede crear la campana.
                  </Text>
                ) : null}

                {formError ? (
                  <Text className='mt-3 rounded-xl bg-[#ffecef] px-3 py-2 text-xs text-[#9f2238]'>
                    {formError}
                  </Text>
                ) : null}

                <View className='mt-5 flex-row items-center justify-between'>
                  <Pressable
                    className='rounded-xl border border-[#d3def3] px-4 py-3'
                    onPress={() => setIsCreateOpen(false)}
                  >
                    <Text className='font-semibold text-[#3a5176]'>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    className={`rounded-xl px-5 py-3 ${canCreate ? 'bg-[#1f5fe0]' : 'bg-[#9db8e5]'}`}
                    disabled={!canCreate}
                    onPress={handleSubmitCampaign}
                  >
                    <Text className='font-semibold text-white'>Guardar campana</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CampaignChatModal
        campaignName={chatCampaign?.name}
        draft={chatDraft}
        inlineOnWeb
        messages={chatMessages}
        onChangeDraft={setChatDraft}
        onClose={() => setChatCampaignId(null)}
        onSend={handleSendChat}
        visible={Boolean(chatCampaignId)}
      />

      <OrganizerBottomTabs activeTab='campanas' />
    </SafeAreaView>
  );
}
