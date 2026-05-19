import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesome5 } from '@expo/vector-icons';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';
import { CampaignChatModal } from '@/modules/campaigns/components/CampaignChatModal';
import { DonorBottomTabs } from '@/modules/donor/components/DonorBottomTabs';
import { NotificationsBell } from '@/modules/notifications/components/NotificationsBell';
import { useRealtimeNotifications } from '@/modules/notifications/hooks/useRealtimeNotifications';
import { addNotification } from '@/modules/notifications/state/notificationsStore';
import { type Campaign, getCampaigns } from '@/services/api/campaignsService';
import {
  createItemDonation,
  createMoneyDonation,
  getItemDonations,
  type ItemDonationResponse,
} from '@/services/api/donationsService';
import { type EventSummary, getEvents } from '@/services/api/eventsService';
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

import {
  connectRealtime,
  emitChatSend,
  joinRealtimeRoom,
  leaveRealtimeRoom,
  onChatMessageCreated,
  onRealtime,
} from '@/services/realtime/realtimeService';
import { getUsers, type UserSummary } from '@/services/api/usersService';

const DEFAULT_DONOR_ID = 1;

function getProgressValue(campaign: Campaign) {
  if (!campaign.goalMoney || campaign.goalMoney <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((campaign.collectedMoney / campaign.goalMoney) * 100));
}

export function DonorCampaignsScreen() {
  const { currentUser } = useAuthSession();
  const { width } = useWindowDimensions();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);

  const [donorId, setDonorId] = useState<number>(DEFAULT_DONOR_ID);

  const [itemDonations, setItemDonations] = useState<ItemDonationResponse[]>([]);

  const [moneyDraftByCampaign, setMoneyDraftByCampaign] = useState<Record<number, string>>({});
  const [donationFeedbackByCampaign, setDonationFeedbackByCampaign] = useState<Record<number, string>>({});
  const [isDonatingMoneyByCampaign, setIsDonatingMoneyByCampaign] = useState<Record<number, boolean>>({});

  const [selectedPhysicalItemByCampaign, setSelectedPhysicalItemByCampaign] = useState<Record<number, string>>({});
  const [physicalQuantityByCampaign, setPhysicalQuantityByCampaign] = useState<Record<number, string>>({});
  const [isPhysicalDropdownOpenByCampaign, setIsPhysicalDropdownOpenByCampaign] = useState<Record<number, boolean>>({});
  const [isDonatingItemsByCampaign, setIsDonatingItemsByCampaign] = useState<Record<number, boolean>>({});

  const [chatCampaignId, setChatCampaignId] = useState<number | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [chatByCampaign, setChatByCampaign] = useState<Record<number, ChatMessage[]>>({});
  const hasCampaignSnapshot = useRef(false);

  const getProgress = useCallback((campaign: Campaign) => getProgressValue(campaign), []);

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
            addNotification({
              notificationId: Date.now() + campaign.id,
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
            addNotification({
              notificationId: Date.now() + campaign.id + 1000,
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

    const [campaignsResult, eventsResult, usersResult, itemsResult] = await Promise.allSettled([
      getCampaigns(),
      getEvents({ page: 1, limit: 100 }),
      getUsers(1, 100),
      getItemDonations(1, 100),
    ]);

    const failedSources: string[] = [];

    if (campaignsResult.status === 'fulfilled') {
      syncCampaigns(campaignsResult.value.data, false);
    } else {
      failedSources.push(`campanas (${getErrorMessage(campaignsResult.reason)})`);
      syncCampaigns([], false);
    }

    if (eventsResult.status === 'fulfilled') {
      setEvents(eventsResult.value.data);
    } else {
      failedSources.push(`eventos (${getErrorMessage(eventsResult.reason)})`);
      setEvents([]);
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
    if (currentUser?.role !== 'donor') {
      return;
    }

    const matchedByEmail = users.find(
      (userItem) => userItem.email.toLowerCase() === currentUser.email.toLowerCase()
    );

    if (matchedByEmail) {
      setDonorId(matchedByEmail.id);
      return;
    }

    const fallbackDonor = users.find((userItem) => userItem.role === 'donor');
    setDonorId(fallbackDonor?.id ?? DEFAULT_DONOR_ID);
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

  const chatMessages = chatCampaignId ? chatByCampaign[chatCampaignId] ?? [] : [];
  const { notifications, unreadCount, toastMessage, markAllAsRead } = useRealtimeNotifications({
    userId: currentUser?.id,
    role: currentUser?.role,
    token: currentUser?.accessToken,
  });

  const campaignTotals = useMemo(() => {
    const totalCollected = campaigns.reduce((sum, c) => sum + (c.collectedMoney || 0), 0);
    const totalGoal = campaigns.reduce((sum, c) => sum + (c.goalMoney || 0), 0);
    const closedCount = campaigns.filter((c) => getProgressValue(c) >= 100).length;
    return { totalCollected, totalGoal, closedCount };
  }, [campaigns]);

  const isWeb = Platform.OS === 'web';
  const donorWebInset = isWeb ? 250 : 0;
  const webGridGap = 12;

  const webContentWidth = useMemo(() => {
    if (!isWeb) return width;
    return Math.max(980, width - donorWebInset - 44);
  }, [isWeb, donorWebInset, width]);

  const webCampaignColumns = useMemo(() => (isWeb ? 3 : 1), [isWeb, webContentWidth]);

  const campaignCardWidth = useMemo(() => {
    if (!isWeb) return undefined;
    const available = webContentWidth - webGridGap * (webCampaignColumns - 1);
    return Math.max(300, Math.floor(available / webCampaignColumns));
  }, [isWeb, webCampaignColumns, webContentWidth]);

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
      userId: donorId,
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
  }, [campaigns, currentUser, donorId, refreshCampaigns]);

  const handleDonateMoney = async (campaign: Campaign) => {
    const value = Number((moneyDraftByCampaign[campaign.id] ?? '').replaceAll(/\D/g, ''));

    if (!value || value <= 0) {
      setDonationFeedbackByCampaign((prev) => ({
        ...prev,
        [campaign.id]: 'Ingresa un valor valido para donar.',
      }));
      return;
    }

    const currentProgress = getProgressValue(campaign);
    if (currentProgress >= 100) {
      setDonationFeedbackByCampaign((prev) => ({
        ...prev,
        [campaign.id]: 'Esta campana ya alcanzo su meta.',
      }));
      return;
    }

    setIsDonatingMoneyByCampaign((prev) => ({ ...prev, [campaign.id]: true }));

    try {
      await createMoneyDonation({ campaignId: campaign.id, donorId, amount: value });

      await refreshCampaigns();

      setMoneyDraftByCampaign((prev) => ({ ...prev, [campaign.id]: '' }));
      setDonationFeedbackByCampaign((prev) => ({ ...prev, [campaign.id]: 'Gracias por tu aporte.' }));
    } catch (error) {
      setDonationFeedbackByCampaign((prev) => ({
        ...prev,
        [campaign.id]: `No se pudo registrar la donacion. ${getErrorMessage(error)}`,
      }));
    } finally {
      setIsDonatingMoneyByCampaign((prev) => ({ ...prev, [campaign.id]: false }));
    }
  };

  const handleDonatePhysicalItem = async (campaignId: number) => {
    const selectedItem = selectedPhysicalItemByCampaign[campaignId] ?? PHYSICAL_DONATION_OPTIONS[0].key;
    const quantity = Number((physicalQuantityByCampaign[campaignId] ?? '').replaceAll(/\D/g, ''));

    if (!quantity || quantity <= 0) {
      setDonationFeedbackByCampaign((prev) => ({
        ...prev,
        [campaignId]: 'Ingresa una cantidad valida de articulos.',
      }));
      return;
    }

    setIsDonatingItemsByCampaign((prev) => ({ ...prev, [campaignId]: true }));

    try {
      const createdDonation = await createItemDonation({
        campaignId,
        donorId,
        itemType: selectedItem,
        quantity,
      });

      setItemDonations((prev) => [...prev, createdDonation]);
      setPhysicalQuantityByCampaign((prev) => ({ ...prev, [campaignId]: '' }));
      setIsPhysicalDropdownOpenByCampaign((prev) => ({ ...prev, [campaignId]: false }));

      const selectedLabel =
        PHYSICAL_DONATION_OPTIONS.find((option) => option.key === selectedItem)?.label ?? selectedItem;

      setDonationFeedbackByCampaign((prev) => ({
        ...prev,
        [campaignId]: `Se registraron ${quantity} ${selectedLabel.toLowerCase()}.`,
      }));
    } catch (error) {
      setDonationFeedbackByCampaign((prev) => ({
        ...prev,
        [campaignId]: `No se pudo registrar la donacion fisica. ${getErrorMessage(error)}`,
      }));
    } finally {
      setIsDonatingItemsByCampaign((prev) => ({ ...prev, [campaignId]: false }));
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
      author: currentUser?.email ?? 'Donante',
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
      <View className='flex-1' style={{ paddingLeft: donorWebInset }}>
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
          </View>

          {isWeb ? (
            <View className='mt-4 flex-row gap-3'>
              <View className='flex-[1.6] rounded-2xl border border-[#d8e6ff] bg-white px-5 py-4'>
                <Text className='text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5f7da7]'>
                  Total posible al cierre
                </Text>
                <Text className='mt-1 text-4xl font-extrabold text-[#13274d]'>
                  {formatMoney(campaignTotals.totalGoal)}
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
              const progress = getProgressValue(campaignItem);
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

                    {isClosed ? null : (
                      <View className='mt-3 flex-row items-center gap-2'>
                        <TextInput
                          className='flex-1 rounded-xl border border-[#d3e2fb] bg-[#f8fbff] px-3 py-2 text-[#18335f]'
                          keyboardType='number-pad'
                          onChangeText={(value) => setMoneyDraftByCampaign((prev) => ({ ...prev, [campaignItem.id]: value }))}
                          placeholder='Monto COP'
                          placeholderTextColor='#8ea6c8'
                          value={moneyDraftByCampaign[campaignItem.id] ?? ''}
                        />
                        <Pressable className='rounded-xl bg-[#1f5fe0] px-3 py-2' onPress={() => handleDonateMoney(campaignItem)}>
                          <Text className='text-xs font-bold text-white'>
                            {isDonatingMoneyByCampaign[campaignItem.id] ? 'Donando...' : 'Donar'}
                          </Text>
                        </Pressable>
                      </View>
                    )}

                    {donationFeedbackByCampaign[campaignItem.id] ? (
                      <Text className='mt-2 text-xs text-[#3a5176]'>{donationFeedbackByCampaign[campaignItem.id]}</Text>
                    ) : null}
                    {isClosed ? null : (
                      <View className='mt-3 rounded-xl bg-[#f6f9ff] p-3'>
                        <Text className='text-xs font-semibold text-[#27436d]'>Donar articulos fisicos</Text>

                        <Pressable
                          className='mt-2 rounded-xl border border-[#d3e2fb] bg-white px-3 py-2'
                          onPress={() =>
                            setIsPhysicalDropdownOpenByCampaign((prev) => ({
                              ...prev,
                              [campaignItem.id]: !prev[campaignItem.id],
                            }))
                          }
                        >
                          <Text className='text-[#1f365d]'>Articulo: {(
                            PHYSICAL_DONATION_OPTIONS.find((o) => o.key === selectedPhysicalItemByCampaign[campaignItem.id])?.label ?? PHYSICAL_DONATION_OPTIONS[0].label
                          )}</Text>
                        </Pressable>

                        {isPhysicalDropdownOpenByCampaign[campaignItem.id] ? (
                          <View className='mt-2 overflow-hidden rounded-xl border border-[#d6e3fb] bg-white'>
                            {PHYSICAL_DONATION_OPTIONS.map((option) => (
                              <Pressable
                                className='border-b border-[#edf3ff] px-3 py-2'
                                key={option.key}
                                onPress={() => {
                                  setSelectedPhysicalItemByCampaign((prev) => ({ ...prev, [campaignItem.id]: option.key }));
                                  setIsPhysicalDropdownOpenByCampaign((prev) => ({ ...prev, [campaignItem.id]: false }));
                                }}
                              >
                                <Text className='text-[#1f365d]'>{option.label}</Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}

                        <View className='mt-2 flex-row items-center gap-2'>
                          <TextInput
                            className='flex-1 rounded-xl border border-[#d3e2fb] bg-white px-3 py-2 text-[#18335f]'
                            keyboardType='number-pad'
                            onChangeText={(value) =>
                              setPhysicalQuantityByCampaign((prev) => ({ ...prev, [campaignItem.id]: value }))
                            }
                            placeholder='Cantidad'
                            placeholderTextColor='#8ea6c8'
                            value={physicalQuantityByCampaign[campaignItem.id] ?? ''}
                          />
                          <Pressable
                            className='rounded-xl bg-[#1d8a51] px-3 py-2'
                            onPress={() => handleDonatePhysicalItem(campaignItem.id)}
                          >
                            <Text className='text-xs font-bold text-white'>
                              {isDonatingItemsByCampaign[campaignItem.id] ? 'Donando...' : 'Donar articulo'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                </Animated.View>
              );
            })}

            {!isLoading && campaigns.length === 0 ? (
              <Text className='text-sm text-[#5d7498]'>Aun no hay campañas publicadas.</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>

      <CampaignChatModal
        campaignName={chatCampaign?.name}
        draft={chatDraft}
        messages={chatMessages}
        onChangeDraft={setChatDraft}
        onClose={() => setChatCampaignId(null)}
        onSend={handleSendChat}
        visible={Boolean(chatCampaignId)}
        inlineOnWeb
      />

      {currentUser?.role === 'donor' ? <DonorBottomTabs activeTab='campanas' /> : null}
    </SafeAreaView>
  );
}
