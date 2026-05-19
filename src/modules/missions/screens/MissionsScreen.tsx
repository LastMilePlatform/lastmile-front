import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';
import { DonorBottomTabs, VOLUNTEER_WEB_PANEL_OFFSET } from '@/modules/donor/components/DonorBottomTabs';
import { getMyJoinedEvents, type EventSummary } from '@/services/api/eventsService';
import {
  getMyShipments,
  getPickupPoints,
  type PickupPoint,
  type Shipment,
  updateShipmentStatus,
} from '@/services/api/logisticsService';
import {
  getRememberedJoinedEvents,
  rememberJoinedEvents,
} from '@/services/state/joinedEventsMemory';

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

function getShipmentStatusLabel(status: Shipment['status']) {
  if (status === 'assigned') {
    return 'Asignado';
  }

  if (status === 'in_transit') {
    return 'En tránsito';
  }

  if (status === 'delivered') {
    return 'Entregado';
  }

  return 'Pendiente';
}

type VolunteerWebMissionsProps = {
  error: string | null;
  feedback: string | null;
  handleUpdateShipmentStatus: (
    shipmentId: number,
    status: Extract<Shipment['status'], 'in_transit' | 'delivered'>
  ) => void;
  isLoading: boolean;
  pickupPointsById: Map<number, PickupPoint>;
  shipments: Shipment[];
  shipmentStats: {
    assigned: number;
    inTransit: number;
    delivered: number;
  };
  supportedEvents: EventSummary[];
  updatingShipmentId: number | null;
  webPanelInset: number;
};

export function MissionsScreen() {
  const { currentUser, logout } = useAuthSession();
  const isVolunteer = currentUser?.role === 'volunteer';
  const isWeb = Platform.OS === 'web';
  const webPanelInset = isVolunteer && isWeb ? VOLUNTEER_WEB_PANEL_OFFSET : 0;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [supportedEvents, setSupportedEvents] = useState<EventSummary[]>([]);
  const [pickupPointsById, setPickupPointsById] = useState<Map<number, PickupPoint>>(new Map());
  const [updatingShipmentId, setUpdatingShipmentId] = useState<number | null>(null);

  const loadMissionData = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const rememberedEvents = getRememberedJoinedEvents();

      const [shipmentsResponse, pickupPointsResponse, joinedEventsResponse] = await Promise.all([
        getMyShipments(currentUser.accessToken, 1, 20),
        getPickupPoints(1, 100, currentUser.accessToken),
        getMyJoinedEvents(currentUser.accessToken).catch(() => rememberedEvents),
      ]);

      const byId = new Map<number, EventSummary>();

      rememberedEvents.forEach((item) => {
        byId.set(item.id, item);
      });

      joinedEventsResponse.forEach((item) => {
        byId.set(item.id, item);
      });

      const mergedSupportedEvents = Array.from(byId.values()).sort((a, b) => b.id - a.id);

      setShipments(shipmentsResponse.data);
      setSupportedEvents(mergedSupportedEvents);
      rememberJoinedEvents(mergedSupportedEvents);
      setPickupPointsById(
        new Map(pickupPointsResponse.data.map((pickupPoint) => [pickupPoint.id, pickupPoint]))
      );
    } catch (error_) {
      const status = getHttpStatusCode(error_);

      if (status === 401) {
        logout();
        setError('Tu sesión expiró. Inicia sesión nuevamente.');
      } else {
        setError(`No fue posible cargar tus misiones. ${getErrorMessage(error_)}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, logout]);

  const handleUpdateShipmentStatus = async (
    shipmentId: number,
    status: Extract<Shipment['status'], 'in_transit' | 'delivered'>
  ) => {
    if (!currentUser) {
      return;
    }

    setUpdatingShipmentId(shipmentId);
    setFeedback(null);
    setError(null);

    try {
      await updateShipmentStatus(shipmentId, status, currentUser.accessToken);
      await loadMissionData();
      setFeedback(status === 'in_transit' ? 'Ruta iniciada correctamente.' : 'Entrega marcada correctamente.');
    } catch (error_) {
      const statusCode = getHttpStatusCode(error_);

      if (statusCode === 401) {
        logout();
        setError('Tu sesión expiró. Inicia sesión nuevamente.');
      } else if (statusCode === 403) {
        setError('No tienes permisos para actualizar este envío.');
      } else if (statusCode === 404) {
        setError('Envío no encontrado.');
      } else if (statusCode === 409) {
        setError('Transición de estado no permitida.');
      } else {
        setError(`No fue posible actualizar el envío. ${getErrorMessage(error_)}`);
      }
    } finally {
      setUpdatingShipmentId(null);
    }
  };

  useEffect(() => {
    loadMissionData();
  }, [loadMissionData]);

  useFocusEffect(
    useCallback(() => {
      loadMissionData();
    }, [loadMissionData])
  );

  const shipmentStats = useMemo(() => {
    const assigned = shipments.filter((shipment) => shipment.status === 'assigned').length;
    const inTransit = shipments.filter((shipment) => shipment.status === 'in_transit').length;
    const delivered = shipments.filter((shipment) => shipment.status === 'delivered').length;

    return { assigned, inTransit, delivered };
  }, [shipments]);

  if (isVolunteer && isWeb) {
    return (
      <VolunteerWebMissions
        error={error}
        feedback={feedback}
        handleUpdateShipmentStatus={handleUpdateShipmentStatus}
        isLoading={isLoading}
        pickupPointsById={pickupPointsById}
        shipments={shipments}
        shipmentStats={shipmentStats}
        supportedEvents={supportedEvents}
        updatingShipmentId={updatingShipmentId}
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
              <Ionicons color='#1e73fa' name='reader' size={22} />
            </View>
            <View>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#111f3c' }}>Misiones</Text>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 13, color: '#60779a', marginBottom: 12 }}>
            Gestiona tus envíos asignados y actualiza su estado de entrega.
          </Text>
        </View>

        {isLoading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
            <ActivityIndicator color='#1e73fa' size='small' />
            <Text style={{ marginLeft: 8, fontSize: 13, color: '#50698e' }}>Cargando tus misiones...</Text>
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
            <View
              style={{
                backgroundColor: '#f7faff',
                borderRadius: 24,
                borderWidth: 1,
                borderColor: '#dbe7ff',
                padding: 18,
                shadowColor: '#163457',
                shadowOpacity: 0.05,
                shadowOffset: { width: 0, height: 3 },
                shadowRadius: 8,
                elevation: 3,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: '#e8f0ff',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8,
                    }}
                  >
                    <Ionicons color='#1f5fe0' name='heart' size={15} />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#1b355d' }}>Eventos que apoyas</Text>
                </View>
                <View
                  style={{
                    borderRadius: 999,
                    backgroundColor: '#e8f0ff',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#1f4fb6' }}>
                    {supportedEvents.length}
                  </Text>
                </View>
              </View>

              {supportedEvents.length === 0 ? (
                <Text style={{ marginTop: 8, fontSize: 13, color: '#61799d' }}>
                  Aún no apoyas eventos.
                </Text>
              ) : (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {supportedEvents.map((eventItem) => (
                    <View
                      key={eventItem.id}
                      style={{
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: '#c8dafc',
                        borderRadius: 14,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1b355d' }}>{eventItem.name}</Text>
                      <Text style={{ marginTop: 2, fontSize: 12, color: '#5f7597' }}>
                        {eventItem.city} · {eventItem.disasterType}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View
              style={{
                backgroundColor: '#f8fbff',
                borderRadius: 24,
                borderWidth: 1,
                borderColor: '#dbe7ff',
                padding: 18,
                shadowColor: '#163457',
                shadowOpacity: 0.05,
                shadowOffset: { width: 0, height: 3 },
                shadowRadius: 8,
                elevation: 3,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: '#e8f0ff',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8,
                    }}
                  >
                    <Ionicons color='#1f5fe0' name='cube' size={15} />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#1b355d' }}>Envíos asignados</Text>
                </View>
                <View
                  style={{
                    borderRadius: 999,
                    backgroundColor: '#e8f0ff',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#1f4fb6' }}>
                    {shipments.length}
                  </Text>
                </View>
              </View>

              {shipments.length === 0 ? (
                <Text style={{ marginTop: 8, fontSize: 13, color: '#61799d' }}>
                  No tienes envíos asignados por ahora.
                </Text>
              ) : (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {shipments.map((shipment) => {
                    const pickupPoint = pickupPointsById.get(shipment.pickupPointId);
                    const isUpdating = updatingShipmentId === shipment.id;

                    return (
                      <View
                        key={shipment.id}
                        style={{
                          borderWidth: 1,
                          borderStyle: 'dashed',
                          borderColor: '#c8dafc',
                          borderRadius: 14,
                          paddingHorizontal: 12,
                          paddingVertical: 12,
                          backgroundColor: '#ffffff',
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: '#111f3c', flex: 1, marginRight: 10 }}>
                            Envío #{`LM-${shipment.id.toString().padStart(4, '0')}`}
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
                              {getShipmentStatusLabel(shipment.status).toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        <Text style={{ marginTop: 6, fontSize: 13, color: '#61799d' }}>
                          {pickupPoint ? `${pickupPoint.name} · ${pickupPoint.address}` : `Punto #${shipment.pickupPointId}`}
                        </Text>

                        {shipment.status === 'assigned' ? (
                          <Pressable
                            style={{
                              marginTop: 14,
                              borderRadius: 12,
                              paddingVertical: 10,
                              alignItems: 'center',
                              backgroundColor: '#1e73fa',
                            }}
                            disabled={isUpdating}
                            onPress={() => handleUpdateShipmentStatus(shipment.id, 'in_transit')}
                          >
                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                              {isUpdating ? 'Actualizando...' : 'Iniciar ruta'}
                            </Text>
                          </Pressable>
                        ) : null}

                        {shipment.status === 'in_transit' ? (
                          <Pressable
                            style={{
                              marginTop: 14,
                              borderRadius: 12,
                              paddingVertical: 10,
                              alignItems: 'center',
                              backgroundColor: '#16a34a',
                            }}
                            disabled={isUpdating}
                            onPress={() => handleUpdateShipmentStatus(shipment.id, 'delivered')}
                          >
                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                              {isUpdating ? 'Actualizando...' : 'Marcar entregado'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>
      </View>
      {isVolunteer && isWeb ? <DonorBottomTabs activeTab='misiones' /> : null}
    </SafeAreaView>
  );
}

function VolunteerWebMissions({
  error,
  feedback,
  handleUpdateShipmentStatus,
  isLoading,
  pickupPointsById,
  shipments,
  shipmentStats,
  supportedEvents,
  updatingShipmentId,
  webPanelInset,
}: Readonly<VolunteerWebMissionsProps>) {
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
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
                  <Ionicons color='#1f63e7' name='reader' size={18} />
                </View>
                <View>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#111f3c' }}>Misiones</Text>
                  <Text style={{ marginTop: 2, fontSize: 12, color: '#6c7f9d' }}>
                    Panel de envios y seguimiento operativo
                  </Text>
                </View>
              </View>
              <View
                style={{
                  backgroundColor: '#ecf3ff',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#1f4fb6' }}>
                  {shipments.length} ENVÍOS
                </Text>
              </View>
            </View>

            <View
              style={{
                marginTop: 12,
                borderRadius: 22,
                backgroundColor: '#1d63cf',
                paddingHorizontal: 20,
                paddingVertical: 20,
              }}
            >
              <Text style={{ color: '#9fd0ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }}>
                PANEL LOGISTICO
              </Text>
              <Text style={{ marginTop: 6, color: '#ffffff', fontSize: 32, fontWeight: '900' }}>
                Ejecuta y Cierra Rutas
              </Text>
              <Text style={{ marginTop: 6, color: '#d9e9ff', fontSize: 14 }}>
                Inicia tránsitos, confirma entregas y mantén visibilidad de tus eventos de apoyo.
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
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#6880a4' }}>ASIGNADOS</Text>
              <Text style={{ marginTop: 8, fontSize: 30, fontWeight: '900', color: '#0f2a52' }}>
                {shipmentStats.assigned}
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
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#6880a4' }}>EN TRANSITO</Text>
              <Text style={{ marginTop: 8, fontSize: 30, fontWeight: '900', color: '#0f2a52' }}>
                {shipmentStats.inTransit}
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
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#6880a4' }}>ENTREGADOS</Text>
              <Text style={{ marginTop: 8, fontSize: 30, fontWeight: '900', color: '#0f2a52' }}>
                {shipmentStats.delivered}
              </Text>
            </View>
            </View>

            {isLoading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
              <ActivityIndicator color='#1e73fa' size='small' />
              <Text style={{ marginLeft: 8, fontSize: 13, color: '#50698e' }}>Cargando tus misiones...</Text>
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
            <View style={{ marginTop: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View
                style={{
                  flex: 0.36,
                  backgroundColor: '#fff',
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: '#dce5f4',
                  padding: 16,
                  shadowColor: '#163457',
                  shadowOpacity: 0.06,
                  shadowOffset: { width: 0, height: 4 },
                  shadowRadius: 10,
                  elevation: 2,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: '#ecf3ff',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 8,
                      }}
                    >
                      <Ionicons color='#1f5fe0' name='heart' size={15} />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#1b355d' }}>Eventos que apoyas</Text>
                  </View>
                  <View
                    style={{
                      borderRadius: 999,
                      backgroundColor: '#e8f0ff',
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#1f4fb6' }}>{supportedEvents.length}</Text>
                  </View>
                </View>
                <Text style={{ marginTop: 8, fontSize: 12, color: '#5f7597' }}>
                  Resumen de campañas en las que ya participas.
                </Text>

                {supportedEvents.length === 0 ? (
                  <View
                    style={{
                      marginTop: 10,
                      borderWidth: 1,
                      borderColor: '#d8e4f5',
                      borderStyle: 'dashed',
                      borderRadius: 14,
                      paddingVertical: 16,
                      paddingHorizontal: 12,
                      backgroundColor: '#f8fbff',
                    }}
                  >
                    <Text style={{ fontSize: 13, color: '#61799d', textAlign: 'center' }}>
                      Aún no apoyas eventos.
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    style={{ marginTop: 10, maxHeight: 420 }}
                    contentContainerStyle={{ gap: 8, paddingRight: 2 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {supportedEvents.map((eventItem) => (
                      <View
                        key={eventItem.id}
                        style={{
                          borderWidth: 1,
                          borderColor: '#d4e2f8',
                          borderRadius: 14,
                          paddingHorizontal: 12,
                          paddingVertical: 11,
                          backgroundColor: '#f9fbff',
                        }}
                      >
                        <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '800', color: '#1b355d' }}>
                          {eventItem.name}
                        </Text>
                        <View style={{ marginTop: 7, flexDirection: 'row', alignItems: 'center' }}>
                          <View
                            style={{
                              borderRadius: 999,
                              backgroundColor: '#eef4ff',
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              marginRight: 6,
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#375e9a' }}>
                              {eventItem.disasterType.toUpperCase()}
                            </Text>
                          </View>
                          <Text numberOfLines={1} style={{ fontSize: 12, color: '#5f7597', flex: 1 }}>
                            {eventItem.city}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={{ flex: 0.64 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#0f2344' }}>Envíos asignados</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1d5fd5' }}>
                    Activos: {shipmentStats.assigned + shipmentStats.inTransit}
                  </Text>
                </View>

                {shipments.length === 0 ? (
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
                    <Ionicons color='#c5d3e8' name='cube-outline' size={36} />
                    <Text style={{ marginTop: 14, fontSize: 15, fontWeight: '700', color: '#5d7399' }}>
                      No tienes envíos asignados por ahora.
                    </Text>
                  </View>
                ) : (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    {shipments.map((shipment) => {
                      const pickupPoint = pickupPointsById.get(shipment.pickupPointId);
                      const isUpdating = updatingShipmentId === shipment.id;

                      return (
                        <View
                          key={shipment.id}
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
                              Envío #{`LM-${shipment.id.toString().padStart(4, '0')}`}
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
                                {getShipmentStatusLabel(shipment.status).toUpperCase()}
                              </Text>
                            </View>
                          </View>

                          <Text style={{ marginTop: 6, fontSize: 13, color: '#61799d' }}>
                            {pickupPoint
                              ? `${pickupPoint.name} · ${pickupPoint.address}`
                              : `Punto #${shipment.pickupPointId}`}
                          </Text>

                          {shipment.status === 'assigned' ? (
                            <Pressable
                              style={{
                                marginTop: 14,
                                borderRadius: 12,
                                paddingVertical: 10,
                                alignItems: 'center',
                                backgroundColor: '#1e73fa',
                              }}
                              disabled={isUpdating}
                              onPress={() => handleUpdateShipmentStatus(shipment.id, 'in_transit')}
                            >
                              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                                {isUpdating ? 'Actualizando...' : 'Iniciar ruta'}
                              </Text>
                            </Pressable>
                          ) : null}

                          {shipment.status === 'in_transit' ? (
                            <Pressable
                              style={{
                                marginTop: 14,
                                borderRadius: 12,
                                paddingVertical: 10,
                                alignItems: 'center',
                                backgroundColor: '#16a34a',
                              }}
                              disabled={isUpdating}
                              onPress={() => handleUpdateShipmentStatus(shipment.id, 'delivered')}
                            >
                              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                                {isUpdating ? 'Actualizando...' : 'Marcar entregado'}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
      <DonorBottomTabs activeTab='misiones' />
    </SafeAreaView>
  );
}