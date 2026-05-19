import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';
import { DonorBottomTabs, VOLUNTEER_WEB_PANEL_OFFSET } from '@/modules/donor/components/DonorBottomTabs';
import { NotificationsBell } from '@/modules/notifications/components/NotificationsBell';
import { useRealtimeNotifications } from '@/modules/notifications/hooks/useRealtimeNotifications';
import {
  type EventSummary,
  getEvents,
  getMyJoinedEvents,
  joinEvent,
  leaveEvent,
} from '@/services/api/eventsService';
import {
  forgetJoinedEvent,
  rememberJoinedEvent,
  rememberJoinedEvents,
} from '@/services/state/joinedEventsMemory';

type SetJoinedEventIds = React.Dispatch<React.SetStateAction<number[]>>;
type SetTextState = React.Dispatch<React.SetStateAction<string | null>>;

type ToggleSupportContext = {
  alreadyJoined: boolean;
  eventId: number;
  events: EventSummary[];
  logout: () => void;
  setJoinedEventIds: SetJoinedEventIds;
  setFeedback: SetTextState;
  setError: SetTextState;
};

type VolunteerWebHomeProps = {
  error: string | null;
  events: EventSummary[];
  feedback: string | null;
  handleToggleSupport: (eventId: number) => void;
  isLoading: boolean;
  joinedEventIds: number[];
  markAllAsRead: () => void;
  notifications: ReturnType<typeof useRealtimeNotifications>['notifications'];
  pendingEventId: number | null;
  toastMessage: string | null;
  unreadCount: number;
  welcomeMessage: string;
  volunteerStats: {
    joinedCount: number;
    activeCount: number;
    availableCount: number;
    cityCount: number;
  };
  webPanelInset: number;
};

function getErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Error desconocido.';
  }

  const rawMessage = error.message?.trim();

  if (!rawMessage) {
    return 'Error desconocido.';
  }

  try {
    const parsed = JSON.parse(rawMessage) as { message?: string | string[] };

    if (Array.isArray(parsed.message)) {
      return parsed.message.join(' | ');
    }

    if (typeof parsed.message === 'string') {
      return parsed.message;
    }

    return rawMessage;
  } catch {
    return rawMessage;
  }
}

function getHttpStatusCode(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  const match = /Unexpected API error \((\d+)\)/.exec(error.message);
  return match ? Number(match[1]) : null;
}

function isAlreadySupportingError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const rawMessage = error.message?.toLowerCase() ?? '';

  return (
    rawMessage.includes('ya estás apoyando este evento') ||
    rawMessage.includes('ya apoyas este evento') ||
    rawMessage.includes('already supporting')
  );
}

export function HomeScreen() {
  const { currentUser, logout } = useAuthSession();
  const isVolunteer = currentUser?.role === 'volunteer';
  const isWeb = Platform.OS === 'web';
  const webPanelInset = isVolunteer && isWeb ? VOLUNTEER_WEB_PANEL_OFFSET : 0;
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [joinedEventIds, setJoinedEventIds] = useState<number[]>([]);
  const [pendingEventId, setPendingEventId] = useState<number | null>(null);
  const { notifications, unreadCount, toastMessage, markAllAsRead } = useRealtimeNotifications({
    userId: currentUser?.id,
    role: currentUser?.role,
    token: currentUser?.accessToken,
  });
  const welcomeMessage = 'Bienvenido de nuevo, voluntario';

  const loadEvents = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [eventsResponse, joinedResponse] = await Promise.all([
        getEvents({ page: 1, limit: 10 }),
        getMyJoinedEvents(currentUser.accessToken),
      ]);

      const joinedIds = joinedResponse.map((eventItem) => eventItem.id);
      const joinedEvents = eventsResponse.data.filter((eventItem) => joinedIds.includes(eventItem.id));

      setJoinedEventIds(joinedIds);
      rememberJoinedEvents(joinedEvents);
      setFeedback(null);
      setEvents(eventsResponse.data);
    } catch (error_) {
      const status = getHttpStatusCode(error_);

      if (status === 401) {
        logout();
        setError('Tu sesión expiró. Inicia sesión nuevamente.');
      } else {
        setError('No fue posible cargar eventos. Revisa la conexión con backend.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, logout]);

  const handleToggleSupport = async (eventId: number) => {
    if (!currentUser) {
      return;
    }

    const alreadyJoined = joinedEventIds.includes(eventId);
    setPendingEventId(eventId);
    setFeedback(null);

    try {
      if (alreadyJoined) {
        await leaveEvent(eventId, currentUser.accessToken);
        setJoinedEventIds((prev) => prev.filter((id) => id !== eventId));
        forgetJoinedEvent(eventId);
        setFeedback('Dejaste de apoyar este evento.');
      } else {
        await joinEvent(eventId, currentUser.accessToken);
        setJoinedEventIds((prev) => (prev.includes(eventId) ? prev : [...prev, eventId]));
        const joinedEvent = events.find((eventItem) => eventItem.id === eventId);

        if (joinedEvent) {
          rememberJoinedEvent(joinedEvent);
        }

        setFeedback('Ahora estás apoyando este evento.');
      }
    } catch (error_) {
      handleToggleSupportError(
        error_,
        {
          alreadyJoined,
          eventId,
          events,
          logout,
          setJoinedEventIds,
          setFeedback,
          setError,
        }
      );
    } finally {
      setPendingEventId(null);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const volunteerStats = useMemo(() => {
    const uniqueCities = new Set(events.map((eventItem) => eventItem.city));
    const joinedCount = joinedEventIds.length;
    const activeCount = events.length;
    const availableCount = Math.max(activeCount - joinedCount, 0);

    return {
      joinedCount,
      activeCount,
      availableCount,
      cityCount: uniqueCities.size,
    };
  }, [events, joinedEventIds]);

  if (isVolunteer && isWeb) {
    return (
      <VolunteerWebHome
        error={error}
        events={events}
        feedback={feedback}
        handleToggleSupport={handleToggleSupport}
        isLoading={isLoading}
        joinedEventIds={joinedEventIds}
        markAllAsRead={markAllAsRead}
        notifications={notifications}
        pendingEventId={pendingEventId}
        toastMessage={toastMessage}
        unreadCount={unreadCount}
        welcomeMessage={welcomeMessage}
        volunteerStats={volunteerStats}
        webPanelInset={webPanelInset}
      />
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f4f6fb' }}>
      <View style={{ flex: 1, paddingLeft: webPanelInset }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: isVolunteer && isWeb ? 24 : 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                backgroundColor: '#dce8ff',
                borderRadius: 16,
                padding: 12,
                marginRight: 12,
              }}
            >
              <Ionicons color='#1e73fa' name='home' size={22} />
            </View>
            <View>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#111f3c' }}>Inicio</Text>
            </View>
          </View>
          <NotificationsBell
            notifications={notifications}
            onMarkAllAsRead={markAllAsRead}
            toastMessage={toastMessage}
            unreadCount={unreadCount}
          />
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 13, color: '#60779a', marginBottom: 12 }}>
            Apoya eventos de emergencia y haz seguimiento a tus participaciones.
          </Text>
        </View>

        {isLoading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
            <ActivityIndicator color='#1e73fa' size='small' />
            <Text style={{ marginLeft: 8, fontSize: 13, color: '#50698e' }}>Cargando eventos...</Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={{
              marginHorizontal: 20,
              marginBottom: 12,
              backgroundColor: '#ffecef',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontSize: 13, color: '#a0253c' }}>{error}</Text>
          </View>
        ) : null}

        {feedback ? (
          <View
            style={{
              marginHorizontal: 20,
              marginBottom: 12,
              backgroundColor: '#e8f7ec',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontSize: 13, color: '#166534' }}>{feedback}</Text>
          </View>
        ) : null}

        {!isLoading && !error ? (
          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            {events.length === 0 ? (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 20,
                  padding: 28,
                  alignItems: 'center',
                  shadowColor: '#163457',
                  shadowOpacity: 0.07,
                  shadowOffset: { width: 0, height: 4 },
                  shadowRadius: 10,
                  elevation: 3,
                }}
              >
                <FontAwesome5 color='#c5d3e8' name='hands-helping' size={36} />
                <Text style={{ marginTop: 14, fontSize: 15, fontWeight: '700', color: '#5d7399' }}>
                  Aún no hay eventos registrados.
                </Text>
              </View>
            ) : (
              events.map((eventItem) => {
                const isJoined = joinedEventIds.includes(eventItem.id);
                const isPending = pendingEventId === eventItem.id;
                let buttonLabel = 'Apoyar evento';

                if (isPending) {
                  buttonLabel = 'Procesando...';
                } else if (isJoined) {
                  buttonLabel = 'Dejar de apoyar';
                }

                return (
                  <View
                    key={eventItem.id}
                    style={{
                      backgroundColor: '#fff',
                      borderRadius: 20,
                      padding: 18,
                      shadowColor: '#163457',
                      shadowOpacity: 0.07,
                      shadowOffset: { width: 0, height: 4 },
                      shadowRadius: 10,
                      elevation: 3,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#111f3c', flex: 1, marginRight: 10 }}>
                        {eventItem.name}
                      </Text>
                      <View
                        style={{
                          backgroundColor: '#eff6ff',
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#1e40af' }}>
                          {eventItem.disasterType.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ marginTop: 6, fontSize: 13, color: '#61799d' }}>{eventItem.city}</Text>

                    <Pressable
                      style={{
                        marginTop: 14,
                        borderRadius: 12,
                        paddingVertical: 10,
                        alignItems: 'center',
                        backgroundColor: isJoined ? '#e8f7ec' : '#1e73fa',
                      }}
                      disabled={isPending}
                      onPress={() => handleToggleSupport(eventItem.id)}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '700',
                          color: isJoined ? '#166534' : '#fff',
                        }}
                      >
                        {buttonLabel}
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        ) : null}
      </ScrollView>
      </View>
      {isVolunteer && isWeb ? <DonorBottomTabs activeTab='inicio' /> : null}
    </SafeAreaView>
  );
}

function VolunteerWebHome({
  error,
  events,
  feedback,
  handleToggleSupport,
  isLoading,
  joinedEventIds,
  markAllAsRead,
  notifications,
  pendingEventId,
  toastMessage,
  unreadCount,
  welcomeMessage,
  volunteerStats,
  webPanelInset,
}: Readonly<VolunteerWebHomeProps>) {
  const webContainerMaxWidth = 1760;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f1f5fb' }}>
      <View style={{ flex: 1, paddingLeft: webPanelInset }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              width: '100%',
              maxWidth: webContainerMaxWidth,
              alignSelf: 'center',
              paddingTop: 14,
              paddingHorizontal: 12,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 4,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: '#e8f1ff',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                  }}
                >
                  <Ionicons color='#1f63e7' name='home' size={18} />
                </View>
                <View>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#111f3c' }}>Inicio</Text>
                  <Text style={{ marginTop: 2, fontSize: 14, color: '#5b7190' }}>{welcomeMessage}</Text>
                </View>
              </View>
              <NotificationsBell
                notifications={notifications}
                onMarkAllAsRead={markAllAsRead}
                toastMessage={toastMessage}
                unreadCount={unreadCount}
              />
            </View>

            <View
              style={{
                marginTop: 12,
                borderRadius: 22,
                backgroundColor: '#1665df',
                paddingHorizontal: 20,
                paddingVertical: 20,
              }}
            >
              <Text style={{ color: '#9cd1ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }}>
                OPERACION EN CURSO
              </Text>
              <Text style={{ marginTop: 6, color: '#ffffff', fontSize: 34, fontWeight: '900' }}>
                Impacto en Tiempo Real
              </Text>
              <Text style={{ marginTop: 6, color: '#d9e9ff', fontSize: 14 }}>
                Prioriza eventos activos, confirma apoyo y monitorea tus acciones desde el panel.
              </Text>
            </View>

            <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: '#ffffff',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#d8e4f5',
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#6880a4' }}>MISIONES ACTIVAS</Text>
              <Text style={{ marginTop: 8, fontSize: 30, fontWeight: '900', color: '#0f2a52' }}>
                {volunteerStats.activeCount}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor: '#ffffff',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#d8e4f5',
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#6880a4' }}>TU APOYO</Text>
              <Text style={{ marginTop: 8, fontSize: 30, fontWeight: '900', color: '#0f2a52' }}>
                {volunteerStats.joinedCount}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor: '#ffffff',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#d8e4f5',
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#6880a4' }}>CIUDADES</Text>
              <Text style={{ marginTop: 8, fontSize: 30, fontWeight: '900', color: '#0f2a52' }}>
                {volunteerStats.cityCount}
              </Text>
            </View>
            </View>

            {isLoading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
                <ActivityIndicator color='#1e73fa' size='small' />
                <Text style={{ marginLeft: 8, fontSize: 13, color: '#50698e' }}>Cargando eventos...</Text>
              </View>
            ) : null}

            {error ? (
            <View
              style={{
                marginTop: 12,
                backgroundColor: '#ffecef',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 13, color: '#a0253c' }}>{error}</Text>
            </View>
            ) : null}

            {feedback ? (
            <View
              style={{
                marginTop: 12,
                backgroundColor: '#e8f7ec',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 13, color: '#166534' }}>{feedback}</Text>
            </View>
            ) : null}

            {!isLoading && !error ? (
            <View style={{ marginTop: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 27, fontWeight: '900', color: '#0f2344' }}>Eventos de Emergencia</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1d5fd5' }}>
                  Disponibles: {volunteerStats.availableCount}
                </Text>
              </View>

              {events.length === 0 ? (
                <View
                  style={{
                    marginTop: 12,
                    backgroundColor: '#fff',
                    borderRadius: 20,
                    padding: 28,
                    alignItems: 'center',
                    shadowColor: '#163457',
                    shadowOpacity: 0.07,
                    shadowOffset: { width: 0, height: 4 },
                    shadowRadius: 10,
                    elevation: 3,
                  }}
                >
                  <FontAwesome5 color='#c5d3e8' name='hands-helping' size={36} />
                  <Text style={{ marginTop: 14, fontSize: 15, fontWeight: '700', color: '#5d7399' }}>
                    Aún no hay eventos registrados.
                  </Text>
                </View>
              ) : (
                <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
                  {events.map((eventItem) => {
                    const isJoined = joinedEventIds.includes(eventItem.id);
                    const isPending = pendingEventId === eventItem.id;
                    let buttonLabel = 'Apoyar evento';

                    if (isPending) {
                      buttonLabel = 'Procesando...';
                    } else if (isJoined) {
                      buttonLabel = 'Dejar de apoyar';
                    }

                    return (
                      <View
                        key={eventItem.id}
                        style={{
                          width: '50%',
                          paddingHorizontal: 6,
                          marginBottom: 12,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: '#fff',
                            borderRadius: 18,
                            borderWidth: 1,
                            borderColor: '#dce5f4',
                            padding: 16,
                            shadowColor: '#163457',
                            shadowOpacity: 0.05,
                            shadowOffset: { width: 0, height: 4 },
                            shadowRadius: 10,
                            elevation: 2,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 16,
                                fontWeight: '800',
                                color: '#111f3c',
                                flex: 1,
                                marginRight: 10,
                              }}
                            >
                              {eventItem.name}
                            </Text>
                            <View
                              style={{
                                backgroundColor: '#eff6ff',
                                borderRadius: 999,
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#1e40af' }}>
                                {eventItem.disasterType.toUpperCase()}
                              </Text>
                            </View>
                          </View>

                          <Text style={{ marginTop: 6, fontSize: 13, color: '#61799d' }}>{eventItem.city}</Text>

                          <Pressable
                            style={{
                              marginTop: 14,
                              borderRadius: 12,
                              paddingVertical: 10,
                              alignItems: 'center',
                              backgroundColor: isJoined ? '#e8f7ec' : '#1e73fa',
                            }}
                            disabled={isPending}
                            onPress={() => handleToggleSupport(eventItem.id)}
                          >
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight: '700',
                                color: isJoined ? '#166534' : '#fff',
                              }}
                            >
                              {buttonLabel}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
      <DonorBottomTabs activeTab='inicio' />
    </SafeAreaView>
  );
}

function handleToggleSupportError(error: unknown, context: ToggleSupportContext) {
  const { alreadyJoined, eventId, events, logout, setJoinedEventIds, setFeedback, setError } = context;
  const status = getHttpStatusCode(error);

  if (!alreadyJoined && (status === 409 || isAlreadySupportingError(error))) {
    setJoinedEventIds((prev) => (prev.includes(eventId) ? prev : [...prev, eventId]));
    const joinedEvent = events.find((eventItem) => eventItem.id === eventId);

    if (joinedEvent) {
      rememberJoinedEvent(joinedEvent);
    }

    setFeedback('Ya apoyas este evento.');
    return;
  }

  if (alreadyJoined && status === 404) {
    setJoinedEventIds((prev) => prev.filter((id) => id !== eventId));
    forgetJoinedEvent(eventId);
    setFeedback('Ya no estabas apoyando este evento.');
    return;
  }

  if (status === 401) {
    logout();
    setError('Tu sesión expiró. Inicia sesión nuevamente.');
    return;
  }

  setError(`No fue posible actualizar el apoyo. ${getErrorMessage(error)}`);
}