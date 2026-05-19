import { FontAwesome5 } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';
import { DonorBottomTabs, VOLUNTEER_WEB_PANEL_OFFSET } from '@/modules/donor/components/DonorBottomTabs';
import {
  OrganizerBottomTabs,
  ORGANIZER_WEB_PANEL_OFFSET,
} from '@/modules/organizer/components/OrganizerBottomTabs';
import {
  type Auction,
  type AuctionBid,
  type AuctionStatus,
  getAuction,
  getAuctionBids,
  placeBid,
  startAuction,
} from '@/services/api/auctionsService';
import { getUser, getUsers, type UserSummary } from '@/services/api/usersService';
import {
  connectRealtime,
  joinRealtimeRoom,
  leaveRealtimeRoom,
  onRealtime,
} from '@/services/realtime/realtimeService';
import { addNotification } from '@/modules/notifications/state/notificationsStore';

type BidPlacedEvent = {
  bidId: number;
  auctionId: number;
  userId: number;
  amount: number;
  previousPrice: number;
};

type AuctionClosedEvent = {
  auctionId: number;
  winnerId: number | null;
  winningAmount: number;
  currency: string;
};

type AuctionStartedEvent = {
  auctionId: number;
  startedAt?: string | null;
  endAt?: string | null;
  status?: AuctionStatus;
  currentPrice?: number;
};

type AuctionLifecycleEvent = {
  auctionId: number;
  status?: AuctionStatus;
  startedAt?: string | null;
  endAt?: string | null;
  currentPrice?: number | null;
  winnerId?: number | null;
};

const STATUS_LABEL: Record<AuctionStatus, string> = {
  created: 'CREADA',
  active: 'ACTIVA',
  closed: 'CERRADA',
  sold: 'VENDIDA',
  cancelled: 'CANCELADA',
};

const STATUS_BG: Record<AuctionStatus, string> = {
  created: '#dce8ff',
  active: '#d1fae5',
  closed: '#f3f4f6',
  sold: '#fff3cd',
  cancelled: '#fee2e2',
};

const STATUS_FG: Record<AuctionStatus, string> = {
  created: '#1e40af',
  active: '#065f46',
  closed: '#4b5563',
  sold: '#92400e',
  cancelled: '#991b1b',
};

function getRoleLabel(role: string): string {
  const roleMap: Record<string, string> = {
    volunteer: 'Voluntario',
    organizer: 'Organizador',
    donor: 'Donante',
  };
  return roleMap[role] || role;
}

function getUserDisplayLabel(user: UserSummary | null | undefined) {
  if (user) {
    const name = user.name || user.fullName || `#${user.id}`;
    return `${getRoleLabel(user.role)} (${name})`;
  }

  return 'Pujador';
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Error desconocido.';
  const rawMessage = error.message?.trim();
  if (!rawMessage) return 'Error desconocido.';
  try {
    const parsed = JSON.parse(rawMessage) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(' | ');
    if (typeof parsed.message === 'string') return parsed.message;
    return rawMessage;
  } catch {
    return rawMessage;
  }
}

function formatCountdown(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPrice(price: number | null, currency: string): string {
  if (price === null) return '–';
  return `${currency} ${price.toLocaleString('es-CO')}`;
}

function normalizeId(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function resolveWinnerId(auction: Auction | null, bids: AuctionBid[]): number | null {
  if (!auction) return null;

  const auctionWinnerId = normalizeId(auction.winnerId);
  if (auctionWinnerId !== null) {
    return auctionWinnerId;
  }

  if (auction.status !== 'closed' && auction.status !== 'sold') {
    return null;
  }

  const currentFinalPrice = auction.currentPrice ?? auction.initialPrice;
  const exactWinningBid = bids.find((bid) => bid.amount === currentFinalPrice);
  if (exactWinningBid) {
    return normalizeId(exactWinningBid.userId);
  }

  const highestBid = bids.reduce<AuctionBid | null>((best, bid) => {
    if (!best) return bid;
    return bid.amount > best.amount ? bid : best;
  }, null);

  return normalizeId(highestBid?.userId ?? null);
}

function normalizeBids(bids: AuctionBid[]): AuctionBid[] {
  return [...bids]
    .map((bid) => ({
      ...bid,
      auctionId: Number(bid.auctionId),
      userId: Number(bid.userId),
      amount: Number(bid.amount),
    }))
    .sort((left, right) => right.amount - left.amount || right.id - left.id);
}

function getWinningBid(auction: Auction | null, bids: AuctionBid[]): AuctionBid | null {
  if (!auction) return null;

  const normalizedBids = normalizeBids(bids);
  if (normalizedBids.length === 0) return null;

  const currentFinalPrice = Number(auction.currentPrice ?? auction.initialPrice);
  const exactMatch = normalizedBids.find((bid) => bid.amount === currentFinalPrice);
  return exactMatch ?? normalizedBids[0] ?? null;
}

function InfoRow({
  label,
  value,
  highlight = false,
}: Readonly<{
  label: string;
  value: string;
  highlight?: boolean;
}>) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
      }}
    >
      <Text style={{ fontSize: 13, color: '#6b7280' }}>{label}</Text>
      <Text
        style={{
          fontSize: 14,
          fontWeight: highlight ? '800' : '600',
          color: highlight ? '#1e73fa' : '#111f3c',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function AuctionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { currentUser } = useAuthSession();
  const isOrganizer = currentUser?.role === 'organizer';
  const isDonor = currentUser?.role === 'donor';
  const isVolunteer = currentUser?.role === 'volunteer';
  let webPanelInset = 0;

  if (Platform.OS === 'web') {
    if (isOrganizer) {
      webPanelInset = ORGANIZER_WEB_PANEL_OFFSET;
    } else if (isVolunteer || isDonor) {
      // Donor and volunteer share the same left panel width on web.
      webPanelInset = VOLUNTEER_WEB_PANEL_OFFSET;
    }
  }

  const isWeb = Platform.OS === 'web';
  const auctionId = Number(id);

  const [auction, setAuction] = useState<Auction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [bids, setBids] = useState<AuctionBid[]>([]);
  const [usersById, setUsersById] = useState<Record<number, UserSummary>>({});

  const [winner, setWinner] = useState<UserSummary | null>(null);

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [bidAmount, setBidAmount] = useState('');
  const [isBidding, setIsBidding] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const closedRef = useRef(false);

  const loadUserDirectory = useCallback(async () => {
    try {
      const firstPage = await getUsers(1, 100, currentUser?.accessToken);
      const allUsers = [...firstPage.data];

      const totalPages = firstPage.meta.totalPages;
      if (totalPages > 1) {
        const remainingPages = await Promise.all(
          Array.from({ length: totalPages - 1 }, async (_, index) => {
            const page = index + 2;
            const response = await getUsers(page, 100, currentUser?.accessToken);
            return response.data;
          })
        );

        remainingPages.forEach((pageUsers) => {
          allUsers.push(...pageUsers);
        });
      }

      const directory = allUsers.reduce<Record<number, UserSummary>>((accumulator, user) => {
        accumulator[user.id] = user;
        return accumulator;
      }, {});

      setUsersById(directory);
    } catch {
      // Ignore if full directory cannot be loaded
    }
  }, [currentUser?.accessToken]);

  const loadAuction = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setWinner(null);
    try {
      const data = await getAuction(auctionId);

      // Always load bids to check if current user participated
      let bidData: AuctionBid[] = [];
      try {
        bidData = normalizeBids(await getAuctionBids(auctionId, currentUser?.accessToken));
        setBids(bidData);
        await loadUserDirectory();
      } catch {
        // silently fail if can't load bids
      }

      const winnerId = resolveWinnerId(data, bidData);

      setAuction({
        ...data,
        winnerId,
      });

      // Load winner info if exists
      if (winnerId !== null) {
        try {
          const winnerData = await getUser(winnerId, currentUser?.accessToken);
          setWinner(winnerData);
        } catch {
          // silently fail if can't load winner
        }
      } else if (getWinningBid(data, bidData)) {
        try {
          const winnerData = await getUser(
            getWinningBid(data, bidData)!.userId,
            currentUser?.accessToken
          );
          setWinner(winnerData);
        } catch {
          // silently fail if can't load winner
        }
      }
    } catch (error) {
      setLoadError(`No se pudo cargar la subasta. ${getErrorMessage(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, [auctionId]);

  useEffect(() => {
    loadAuction();
  }, [loadAuction]);

  // Connect to socket and listen to real-time updates for this auction
  useEffect(() => {
    if (!auction) return;

    if (currentUser) {
      connectRealtime({ userId: currentUser.id, role: currentUser.role });
    }

    const room = `auction:${auctionId}:bids`;
    joinRealtimeRoom(room);

    const offBidPlaced = onRealtime<BidPlacedEvent>('auction.bid.placed', (event) => {
      if (event.auctionId !== auctionId) return;

      const newBid: AuctionBid = {
        id: event.bidId,
        auctionId: event.auctionId,
        userId: event.userId,
        amount: event.amount,
        createdAt: new Date().toISOString(),
      };

      setBids((prev) => normalizeBids([newBid, ...prev]));
      if (!usersById[event.userId]) {
        loadUserDirectory();
      }
      setAuction((prev) =>
        prev ? { ...prev, currentPrice: event.amount } : prev
      );
    });

    const onAuctionStarted = (event: AuctionStartedEvent) => {
      if (event.auctionId !== auctionId) return;

      setAuction((prev) => {
        if (!prev) return prev;

        const startedAt = event.startedAt ?? new Date().toISOString();
        const endAt =
          event.endAt ??
          prev.endAt ??
          new Date(new Date(startedAt).getTime() + prev.durationMinutes * 60000).toISOString();

        return {
          ...prev,
          status: event.status ?? 'active',
          startedAt,
          endAt,
          currentPrice: event.currentPrice ?? prev.currentPrice,
        };
      });
    };

    const offAuctionStarted = onRealtime<AuctionStartedEvent>('auction.started', onAuctionStarted);
    const offAuctionStart = onRealtime<AuctionStartedEvent>('auction.start', onAuctionStarted);
    const offAuctionUpdated = onRealtime<AuctionStartedEvent>('auction.updated', onAuctionStarted);

    const onLifecycleUpdate = (event: AuctionLifecycleEvent) => {
      if (event.auctionId !== auctionId) return;

      setAuction((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: event.status ?? prev.status,
          startedAt: event.startedAt ?? prev.startedAt,
          endAt: event.endAt ?? prev.endAt,
          currentPrice: event.currentPrice ?? prev.currentPrice,
          winnerId: event.winnerId ?? prev.winnerId,
        };
      });
    };

    const offAuctionStatusChanged = onRealtime<AuctionLifecycleEvent>('auction.status.changed', onLifecycleUpdate);
    const offAuctionSold = onRealtime<AuctionLifecycleEvent>('auction.sold', (event) => {
      onLifecycleUpdate({ ...event, status: event.status ?? 'sold' });
    });
    const offAuctionCancelled = onRealtime<AuctionLifecycleEvent>('auction.cancelled', (event) => {
      onLifecycleUpdate({ ...event, status: event.status ?? 'cancelled' });
    });

    const offAuctionClosed = onRealtime<AuctionClosedEvent>('auction.closed', (event) => {
      if (event.auctionId !== auctionId) return;

      closedRef.current = true;
      setAuction((prev) =>
        prev
          ? {
              ...prev,
              status: 'closed',
              winnerId: event.winnerId,
              currentPrice: event.winningAmount,
            }
          : prev
      );

      // Load winner info if exists
      const winnerId = normalizeId(event.winnerId);

      if (winnerId !== null) {
        getUser(winnerId, currentUser?.accessToken)
          .then((userData) => {
            setWinner(userData);
            
            // Send notification to current user
            if (currentUser) {
              const isWinner = Number(currentUser.id) === winnerId;
              const winnerName = userData.name || userData.fullName || `Usuario #${winnerId}`;
              const notificationMessage = isWinner
                ? `¡Ganaste la subasta! Precio final: ${event.currency} ${event.winningAmount.toLocaleString('es-CO')}`
                : `La subasta finalizó. Ganador: ${winnerName}`;
              
              addNotification({
                notificationId: event.auctionId,
                userId: currentUser.id,
                message: notificationMessage,
                auctionId: event.auctionId,
                createdAt: new Date().toISOString(),
              });
            }
          })
          .catch(() => {
            // Still send notification even if can't load winner
            if (currentUser) {
              const isWinner = Number(currentUser.id) === winnerId;
              const notificationMessage = isWinner
                ? `¡Ganaste la subasta! Precio final: ${event.currency} ${event.winningAmount.toLocaleString('es-CO')}`
                : `La subasta finalizó. Ganador: Usuario #${winnerId}`;
              
              addNotification({
                notificationId: event.auctionId,
                userId: currentUser.id,
                message: notificationMessage,
                auctionId: event.auctionId,
                createdAt: new Date().toISOString(),
              });
            }
          });
      }
      
      if (winnerId === null && currentUser) {
        // No winner
        addNotification({
          notificationId: event.auctionId,
          userId: currentUser.id,
          message: 'La subasta finalizó sin ganador',
          auctionId: event.auctionId,
          createdAt: new Date().toISOString(),
        });
      }
    });

    return () => {
      offBidPlaced();
      offAuctionStarted();
      offAuctionStart();
      offAuctionUpdated();
      offAuctionStatusChanged();
      offAuctionSold();
      offAuctionCancelled();
      offAuctionClosed();
      leaveRealtimeRoom(room);
    };
  }, [auction, auctionId, currentUser]);

  // Fallback: while auction is created, poll status changes in case backend does not emit started events.
  useEffect(() => {
    if (auction?.status !== 'created') {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const latest = await getAuction(auctionId);
        setAuction((prev) => (prev ? { ...prev, ...latest } : latest));
      } catch {
        // silent fallback polling
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [auction, auctionId]);

  // Countdown timer — runs only while auction is active and endAt is set
  useEffect(() => {
    if (auction?.status !== 'active' || !auction.endAt) {
      setSecondsLeft(null);
      return;
    }

    closedRef.current = false;
    const endTime = new Date(auction.endAt).getTime();
    const computeRemaining = () => Math.max(0, Math.floor((endTime - Date.now()) / 1000));

    setSecondsLeft(computeRemaining());

    const interval = setInterval(() => {
      const remaining = computeRemaining();
      setSecondsLeft(remaining);

      if (remaining === 0 && !closedRef.current) {
        closedRef.current = true;
        clearInterval(interval);
        setAuction((prev) => (prev ? { ...prev, status: 'closed' } : prev));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [auction?.status, auction?.endAt]);

  const handleStart = async () => {
    setIsStarting(true);
    setStartError(null);
    try {
      const updated = await startAuction(auctionId, currentUser?.accessToken);
      setAuction(updated);
    } catch (error) {
      setStartError(`No se pudo iniciar la subasta. ${getErrorMessage(error)}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handlePlaceBid = async () => {
    if (!currentUser || !auction) return;

    if (auction.bidMode === 'fixed_increment') {
      setIsBidding(true);
      setBidError(null);
      try {
        await placeBid(auctionId, { userId: currentUser.id }, currentUser.accessToken);
      } catch (error) {
        setBidError(`No se pudo registrar la oferta. ${getErrorMessage(error)}`);
      } finally {
        setIsBidding(false);
      }
      return;
    }

    const amount = Number.parseFloat(bidAmount);

    if (Number.isNaN(amount) || amount <= 0) {
      setBidError('Ingresa un monto válido mayor a 0.');
      return;
    }
    const currentBestPrice = auction.currentPrice ?? auction.initialPrice;
    if (amount <= currentBestPrice) {
      setBidError(`La oferta debe superar ${formatPrice(currentBestPrice, auction.currency)}.`);
      return;
    }

    setIsBidding(true);
    setBidError(null);

    try {
      await placeBid(
        auctionId,
        { userId: currentUser.id, amount },
        currentUser.accessToken
      );
      setBidAmount('');
    } catch (error) {
      setBidError(`No se pudo registrar la oferta. ${getErrorMessage(error)}`);
    } finally {
      setIsBidding(false);
    }
  };

  const cardStyle = {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#163457' as const,
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f4f6fb' }}>
      <View style={{ flex: 1, paddingLeft: webPanelInset }}>
        <View
          style={{
            flex: 1,
            width: '100%',
            maxWidth: isWeb ? 1760 : undefined,
            alignSelf: 'center',
            paddingHorizontal: isWeb ? 16 : 0,
          }}
        >
          {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 12,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
            backgroundColor: '#ebebeb',
            borderRadius: 14,
            padding: 10,
            marginRight: 14,
          }}
        >
          <FontAwesome5 color='#111f3c' name='arrow-left' size={16} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: '900', color: '#111f3c' }}>
          Detalle de subasta
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Loading ── */}
        {isLoading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
            <ActivityIndicator color='#1e73fa' size='small' />
            <Text style={{ marginLeft: 8, fontSize: 13, color: '#50698e' }}>
              Cargando subasta...
            </Text>
          </View>
        ) : null}

        {/* ── Load error ── */}
        {loadError ? (
          <View
            style={{
              backgroundColor: '#ffecef',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
              marginTop: 8,
            }}
          >
            <Text style={{ fontSize: 13, color: '#a0253c' }}>{loadError}</Text>
          </View>
        ) : null}

        {!isLoading && auction ? (
          <>
            {/* ── Info card ── */}
            <View style={{ ...cardStyle, marginTop: 4 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: 20,
                    fontWeight: '900',
                    color: '#111f3c',
                    flex: 1,
                    marginRight: 10,
                  }}
                >
                  {auction.itemName}
                </Text>
                <View
                  style={{
                    backgroundColor: STATUS_BG[auction.status],
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: STATUS_FG[auction.status],
                      letterSpacing: 0.5,
                    }}
                  >
                    {STATUS_LABEL[auction.status]}
                  </Text>
                </View>
              </View>

              {auction.status === 'active' && secondsLeft !== null ? (
                <View
                  style={{
                    backgroundColor: secondsLeft <= 60 ? '#fff1f1' : '#f0f7ff',
                    borderRadius: 16,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    marginBottom: 14,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 4 }}>
                    Tiempo restante
                  </Text>
                  <Text
                    style={{
                      fontSize: 36,
                      fontWeight: '900',
                      letterSpacing: 2,
                      color: secondsLeft <= 60 ? '#ef4444' : '#1e73fa',
                    }}
                  >
                    {formatCountdown(secondsLeft)}
                  </Text>
                </View>
              ) : null}

              {auction.description ? (
                <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 12 }}>
                  {auction.description}
                </Text>
              ) : null}

              <InfoRow
                highlight
                label='Precio actual'
                value={formatPrice(
                  auction.currentPrice ?? auction.initialPrice,
                  auction.currency
                )}
              />
              <InfoRow
                label='Precio inicial'
                value={formatPrice(auction.initialPrice, auction.currency)}
              />
              <InfoRow label='Moneda' value={auction.currency} />
              <InfoRow label='Duración' value={`${auction.durationMinutes} minutos`} />
              <InfoRow label='Vendedor' value={`Organizador #${auction.sellerId}`} />
              <InfoRow
                label='Modo de puja'
                value={
                  auction.bidMode === 'fixed_increment'
                    ? `Incremento fijo: +${formatPrice(auction.bidIncrement, auction.currency)}`
                    : 'Puja libre'
                }
              />
              {auction.startedAt ? (
                <InfoRow
                  label='Iniciada'
                  value={new Date(auction.startedAt).toLocaleString('es-CO')}
                />
              ) : null}
              {auction.endAt ? (
                <InfoRow
                  label='Finaliza'
                  value={new Date(auction.endAt).toLocaleString('es-CO')}
                />
              ) : null}
            </View>

            {/* ── Start auction (CREATED) ── */}
            {auction.status === 'created' && currentUser?.role === 'organizer' ? (
              <View style={{ marginTop: 16 }}>
                {startError ? (
                  <View
                    style={{
                      backgroundColor: '#ffecef',
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: '#a0253c' }}>{startError}</Text>
                  </View>
                ) : null}
                <Pressable
                  disabled={isStarting}
                  onPress={handleStart}
                  style={{
                    backgroundColor: '#16a34a',
                    borderRadius: 18,
                    paddingVertical: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                  }}
                >
                  {isStarting ? (
                    <ActivityIndicator color='#fff' size='small' />
                  ) : (
                    <>
                      <FontAwesome5
                        color='#fff'
                        name='play'
                        size={16}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>
                        Iniciar subasta
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}

            {/* ── Active: place bid + live bids ── */}
            {auction.status === 'active' && currentUser?.role !== 'organizer' ? (
              <View style={{ marginTop: 16, gap: 14 }}>
                {/* Place bid */}
                <View style={cardStyle}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '800',
                      color: '#111f3c',
                      marginBottom: 4,
                    }}
                  >
                    Realizar oferta
                  </Text>

                  {auction.bidMode === 'fixed_increment' ? (
                    <>
                      <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
                        Siguiente precio:
                      </Text>
                      <Text
                        style={{
                          fontSize: 20,
                          fontWeight: '900',
                          color: '#1f5fe0',
                          marginBottom: 12,
                        }}
                      >
                        {formatPrice(
                          (auction.currentPrice ?? auction.initialPrice) +
                            (auction.bidIncrement ?? 0),
                          auction.currency
                        )}
                      </Text>
                      {bidError ? (
                        <Text
                          style={{
                            marginBottom: 8,
                            backgroundColor: '#ffecef',
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            fontSize: 13,
                            color: '#9f2238',
                          }}
                        >
                          {bidError}
                        </Text>
                      ) : null}
                      <Pressable
                        disabled={isBidding}
                        onPress={handlePlaceBid}
                        style={{
                          backgroundColor: isBidding ? '#9db8e5' : '#1f5fe0',
                          borderRadius: 14,
                          paddingVertical: 14,
                          alignItems: 'center',
                        }}
                      >
                        {isBidding ? (
                          <ActivityIndicator color='#fff' size='small' />
                        ) : (
                          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                            Pujar +{formatPrice(auction.bidIncrement, auction.currency)}
                          </Text>
                        )}
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
                        La oferta debe superar{' '}
                        {formatPrice(
                          auction.currentPrice ?? auction.initialPrice,
                          auction.currency
                        )}
                        .
                      </Text>
                      <TextInput
                        style={{
                          borderWidth: 1,
                          borderColor: '#d3e2fb',
                          borderRadius: 14,
                          backgroundColor: '#f8fbff',
                          paddingHorizontal: 16,
                          paddingVertical: 12,
                          color: '#18335f',
                          fontSize: 15,
                        }}
                        keyboardType='numeric'
                        onChangeText={setBidAmount}
                        placeholder='Monto de la oferta'
                        placeholderTextColor='#8ea6c8'
                        value={bidAmount}
                      />
                      {bidError ? (
                        <Text
                          style={{
                            marginTop: 8,
                            backgroundColor: '#ffecef',
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            fontSize: 13,
                            color: '#9f2238',
                          }}
                        >
                          {bidError}
                        </Text>
                      ) : null}
                      <Pressable
                        disabled={isBidding || !bidAmount.trim()}
                        onPress={handlePlaceBid}
                        style={{
                          marginTop: 12,
                          backgroundColor:
                            isBidding || !bidAmount.trim() ? '#9db8e5' : '#1f5fe0',
                          borderRadius: 14,
                          paddingVertical: 14,
                          alignItems: 'center',
                        }}
                      >
                        {isBidding ? (
                          <ActivityIndicator color='#fff' size='small' />
                        ) : (
                          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                            Ofertar
                          </Text>
                        )}
                      </Pressable>
                    </>
                  )}
                </View>

                {/* Live bids */}
                <View style={cardStyle}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: '#16a34a',
                        marginRight: 8,
                      }}
                    />
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#111f3c' }}>
                      Ofertas en tiempo real
                    </Text>
                  </View>
                  {bids.length === 0 ? (
                    <Text style={{ fontSize: 13, color: '#9ca3af' }}>
                      Aun no hay ofertas registradas.
                    </Text>
                  ) : (
                    bids.map((bid, index) => (
                      <View
                        key={bid.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 10,
                          borderBottomWidth: index < bids.length - 1 ? 1 : 0,
                          borderBottomColor: '#f3f4f6',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View
                            style={{
                              backgroundColor: '#e8f0ff',
                              borderRadius: 10,
                              padding: 8,
                              marginRight: 10,
                            }}
                          >
                            <FontAwesome5 color='#1e73fa' name='user' size={12} />
                          </View>
                          <Text style={{ fontSize: 13, color: '#374151' }}>
                            {getUserDisplayLabel(usersById[bid.userId])}
                          </Text>
                        </View>
                        <Text
                          style={{ fontSize: 15, fontWeight: '800', color: '#1f5fe0' }}
                        >
                          {auction.currency} {bid.amount.toLocaleString('es-CO')}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            ) : null}

            {/* ── Closed / Sold: winner ── */}
            {auction.status === 'closed' || auction.status === 'sold' ? (() => {
              const winningBid = getWinningBid(auction, bids);
              const resolvedWinnerId = winningBid ? normalizeId(winningBid.userId) : resolveWinnerId(auction, bids);
              const userWon = resolvedWinnerId !== null && Number(currentUser?.id) === resolvedWinnerId;
              const userParticipated = bids.some((bid) => bid.userId === currentUser?.id);

              return (
                <View style={{ ...cardStyle, marginTop: 16 }}>
                  {/* Winner banner */}
                  {userWon && (
                    <View
                      style={{
                        backgroundColor: '#d1fae5',
                        borderRadius: 12,
                        padding: 14,
                        marginBottom: 14,
                        alignItems: 'center',
                      }}
                    >
                      <FontAwesome5
                        color='#065f46'
                        name='trophy'
                        size={24}
                        style={{ marginBottom: 8 }}
                      />
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#065f46' }}>
                        ¡Ganaste esta subasta!
                      </Text>
                      <Text style={{ fontSize: 13, color: '#047857', marginTop: 4 }}>
                        Felicidades por tu victoria
                      </Text>
                    </View>
                  )}

                  {!userWon && userParticipated && (
                    <View
                      style={{
                        backgroundColor: '#fee2e2',
                        borderRadius: 12,
                        padding: 14,
                        marginBottom: 14,
                        alignItems: 'center',
                      }}
                    >
                      <FontAwesome5
                        color='#991b1b'
                        name='medal'
                        size={24}
                        style={{ marginBottom: 8 }}
                      />
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#991b1b' }}>
                        No ganaste esta subasta
                      </Text>
                      <Text style={{ fontSize: 13, color: '#dc2626', marginTop: 4 }}>
                        Pero participaste en la puja. ¡Intenta en la próxima!
                      </Text>
                    </View>
                  )}

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: 14,
                    }}
                  >
                    <FontAwesome5
                      color='#92400e'
                      name='trophy'
                      size={18}
                      style={{ marginRight: 10 }}
                    />
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#111f3c' }}>
                      Resultado final
                    </Text>
                  </View>
                  {resolvedWinnerId === null ? (
                    <InfoRow label='Ganador' value='Sin ganador registrado' />
                  ) : (() => {
                    const winnerName = winner?.name || winner?.fullName || `#${winner?.id}`;
                    const winnerDisplayText = winner
                      ? `${getRoleLabel(winner.role)} (${winnerName})`
                      : `Usuario #${resolvedWinnerId}`;
                    return (
                      <InfoRow
                        highlight
                        label='Ganador'
                        value={winnerDisplayText}
                      />
                    );
                  })()}
                  <InfoRow
                    highlight
                    label='Precio final'
                    value={formatPrice(
                      auction.currentPrice ?? auction.initialPrice,
                      auction.currency
                    )}
                  />
                  {auction.soldAt ? (
                    <InfoRow
                      label='Vendida el'
                      value={new Date(auction.soldAt).toLocaleString('es-CO')}
                    />
                  ) : null}
                </View>
              );
            })() : null}
          </>
        ) : null}
      </ScrollView>
      </View>
      </View>

      {isOrganizer ? <OrganizerBottomTabs activeTab='subastas' /> : null}
      {isDonor || isVolunteer ? <DonorBottomTabs activeTab='subastas' /> : null}
    </SafeAreaView>
  );
}
