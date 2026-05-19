import { FontAwesome5 } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  COLOMBIAN_CITIES,
  type ColombianCity,
} from '@/modules/missions/constants/colombianCities';
import {
  OrganizerBottomTabs,
  ORGANIZER_WEB_PANEL_OFFSET,
} from '@/modules/organizer/components/OrganizerBottomTabs';
import { type Campaign, getCampaigns } from '@/services/api/campaignsService';
import { type EventSummary, getEvents } from '@/services/api/eventsService';
import {
  assignShipmentVolunteer,
  createShipment,
  createPickupPoint,
  getPickupPoints,
  getShipments,
  type PickupPoint,
  type Shipment,
} from '@/services/api/logisticsService';
import { rememberPickupPoint, rememberPickupPoints } from '@/services/state/pickupPointsMemory';
import { getUsers, type UserSummary } from '@/services/api/usersService';
import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';

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

function getShipmentStatusLabel(status: Shipment['status']) {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'assigned':
      return 'Asignado';
    case 'in_transit':
      return 'En tránsito';
    case 'delivered':
      return 'Entregado';
    default:
      return status;
  }
}

function getShipmentStatusColor(status: Shipment['status']) {
  switch (status) {
    case 'in_transit':
      return '#1e73fa';
    case 'pending':
      return '#f59e0b';
    case 'assigned':
      return '#16a34a';
    case 'delivered':
      return '#6b7280';
    default:
      return '#6b7280';
  }
}

function getEstimatedTime(id: number) {
  const h = 10 + (id % 8);
  const m = String((id * 13) % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function getSector(id: number) {
  const letter = String.fromCodePoint(65 + (id % 5));
  const num = (id % 9) + 1;
  return `Sector ${letter}-${num}`;
}

function toNumberId(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getShipmentCampaignId(shipment: Shipment) {
  const record = shipment as unknown as {
    campaignId?: unknown;
    campaign_id?: unknown;
    campaign?: { id?: unknown };
  };

  return (
    toNumberId(record.campaignId) ??
    toNumberId(record.campaign_id) ??
    toNumberId(record.campaign?.id)
  );
}

function getShipmentEventId(shipment: Shipment) {
  const record = shipment as unknown as {
    eventId?: unknown;
    event_id?: unknown;
    event?: { id?: unknown };
  };

  return (
    toNumberId(record.eventId) ??
    toNumberId(record.event_id) ??
    toNumberId(record.event?.id)
  );
}

function getNormalizedShipmentStatus(shipment: Shipment) {
  const status = String(shipment.status ?? '').trim().toLowerCase();

  if (status === 'pending' || status === 'assigned' || status === 'in_transit' || status === 'delivered') {
    return status;
  }

  return 'pending';
}

function PickupPointCard({ point, event, bgColor }: Readonly<{ point: PickupPoint; event: EventSummary | undefined; bgColor: string }>) {
  const isWebCard = Platform.OS === 'web';
  const pickupImageSource = {
    uri: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80',
  };

  return (
    <View
      style={{
        width: isWebCard ? 248 : 180,
        marginRight: isWebCard ? 16 : 14,
        borderRadius: 20,
        backgroundColor: '#fff',
        overflow: 'hidden',
        shadowColor: '#163457',
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 14,
        elevation: 5,
      }}
    >
      <ImageBackground
        source={pickupImageSource}
        resizeMode='cover'
        style={{ height: isWebCard ? 156 : 136, alignItems: 'center', justifyContent: 'center' }}
        imageStyle={{ transform: [{ scale: 1.02 }] }}
      >
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: '#0a1f3f1f',
          }}
        />
        <FontAwesome5 color='rgba(255,255,255,0.92)' name='warehouse' size={38} />
        <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: '#16a34a', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>ACTIVO</Text>
        </View>
      </ImageBackground>
      <View style={{ padding: 12 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: '#111f3c' }} numberOfLines={1}>{point.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
          <FontAwesome5 color='#9ca3af' name='map-marker-alt' size={11} />
          <Text style={{ fontSize: 12, color: '#6b7280', marginLeft: 5 }} numberOfLines={1}>{point.address}</Text>
        </View>
        {event ? (
          <Text style={{ fontSize: 11, color: '#1e73fa', marginTop: 4 }} numberOfLines={1}>{event.name}</Text>
        ) : null}
      </View>
    </View>
  );
}

function ShipmentRow({ shipment }: Readonly<{ shipment: Shipment }>) {
  const statusLabel = getShipmentStatusLabel(shipment.status);
  const statusColor = getShipmentStatusColor(shipment.status);
  const estimatedTime = getEstimatedTime(shipment.id);
  const sector = getSector(shipment.id);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#163457',
        shadowOpacity: 0.07,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 10,
        elevation: 3,
      }}
    >
      <View style={{ backgroundColor: '#e8f3ff', borderRadius: 16, padding: 14 }}>
        <FontAwesome5 color='#1e73fa' name='box' size={20} />
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#111f3c' }}>
          #{`LM-${shipment.id.toString().padStart(4, '0')}`}
        </Text>
        <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>Entrega Estimada: {estimatedTime}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
        <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>{sector}</Text>
      </View>
    </View>
  );
}

function VolunteerCard({
  volunteer,
  onAssign,
  isAssigning,
  isWeb,
}: Readonly<{
  volunteer: UserSummary;
  onAssign: (volunteer: UserSummary) => void;
  isAssigning: boolean;
  isWeb: boolean;
}>) {
  const volunteerName = volunteer.fullName ?? volunteer.name ?? 'Sin nombre';

  return (
    <View
      style={{
        width: isWeb ? '31.5%' : '48%',
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 16,
        alignItems: 'center',
        marginBottom: 14,
        shadowColor: '#163457',
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 12,
        elevation: 3,
      }}
    >
      <View style={{ position: 'relative' }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#0d8383', alignItems: 'center', justifyContent: 'center' }}>
          <FontAwesome5 color='#fff' name='user' size={26} />
        </View>
        <View style={{ position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#fff' }} />
      </View>
      <Text style={{ marginTop: 10, fontSize: 15, fontWeight: '800', color: '#111f3c', textAlign: 'center' }} numberOfLines={1}>{volunteerName}</Text>
      <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, letterSpacing: 1 }}>VOLUNTARIO</Text>
      <Pressable
        style={{ marginTop: 12, backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 22, paddingVertical: 9, width: '100%', alignItems: 'center' }}
        onPress={() => onAssign(volunteer)}
      >
        <Text style={{ color: '#1e73fa', fontSize: 13, fontWeight: '700' }}>{isAssigning ? 'Asignando...' : 'Asignar'}</Text>
      </Pressable>
    </View>
  );
}

export function OrganizerLogisticsScreen() {
  const { currentUser, logout } = useAuthSession();
  const organizerWebInset = Platform.OS === 'web' ? ORGANIZER_WEB_PANEL_OFFSET : 0;
  const isWeb = Platform.OS === 'web';
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [volunteers, setVolunteers] = useState<UserSummary[]>([]);
  const [selectedVolunteerForAssignment, setSelectedVolunteerForAssignment] = useState<UserSummary | null>(null);
  const [selectedCampaignForAssignment, setSelectedCampaignForAssignment] = useState<number | null>(null);
  const [isAssigningVolunteer, setIsAssigningVolunteer] = useState(false);
  const [assignmentFeedback, setAssignmentFeedback] = useState<string | null>(null);

  const [isCreatePickupOpen, setIsCreatePickupOpen] = useState(false);
  const [isCreateShipmentOpen, setIsCreateShipmentOpen] = useState(false);
  const [pickupName, setPickupName] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [selectedCity, setSelectedCity] = useState<ColombianCity | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedCampaignIdForShipment, setSelectedCampaignIdForShipment] = useState<number | null>(null);
  const [selectedPickupPointIdForShipment, setSelectedPickupPointIdForShipment] = useState<number | null>(null);
  const [shipmentSubmitError, setShipmentSubmitError] = useState<string | null>(null);
  const [isCreatingShipment, setIsCreatingShipment] = useState(false);
  const [isCitySelectorOpen, setIsCitySelectorOpen] = useState(false);
  const [pickupSubmitError, setPickupSubmitError] = useState<string | null>(null);
  const [isCreatingPickup, setIsCreatingPickup] = useState(false);

    type CreatePickupFormProps = Readonly<{
      events: EventSummary[];
      selectedEventId: number | null;
      onSelectEvent: (id: number) => void;
      pickupName: string;
      onChangePickupName: (text: string) => void;
      pickupAddress: string;
      onChangePickupAddress: (text: string) => void;
      selectedCity: ColombianCity | null;
      isCitySelectorOpen: boolean;
      onToggleCitySelector: () => void;
      onSelectCity: (city: ColombianCity) => void;
      pickupSubmitError: string | null;
      isCreatingPickup: boolean;
      canCreatePickup: boolean;
      onCancel: () => void;
      onSubmit: () => void;
    }>;

    function CreatePickupForm({
      events, selectedEventId, onSelectEvent,
      pickupName, onChangePickupName,
      pickupAddress, onChangePickupAddress,
      selectedCity, isCitySelectorOpen, onToggleCitySelector, onSelectCity,
      pickupSubmitError, isCreatingPickup, canCreatePickup,
      onCancel, onSubmit,
    }: CreatePickupFormProps) {
      return (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: '#fff', borderRadius: 24, padding: 20, shadowColor: '#163457', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 4 }}
        >
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#19335f', marginBottom: 4 }}>Crear punto de recogida</Text>

          <Text style={{ marginTop: 12, marginBottom: 4, fontSize: 13, fontWeight: '700', color: '#27436d' }}>Nombre</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: '#d3e2fb', borderRadius: 14, backgroundColor: '#f8fbff', paddingHorizontal: 16, paddingVertical: 12, color: '#18335f' }}
            onChangeText={onChangePickupName}
            placeholder='Ej: Punto norte de donaciones'
            placeholderTextColor='#8ea6c8'
            value={pickupName}
          />

          <Text style={{ marginTop: 12, marginBottom: 4, fontSize: 13, fontWeight: '700', color: '#27436d' }}>Direccion</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: '#d3e2fb', borderRadius: 14, backgroundColor: '#f8fbff', paddingHorizontal: 16, paddingVertical: 12, color: '#18335f' }}
            onChangeText={onChangePickupAddress}
            placeholder='Ej: Cra 15 # 102-30'
            placeholderTextColor='#8ea6c8'
            value={pickupAddress}
          />

          <Text style={{ marginTop: 12, marginBottom: 4, fontSize: 13, fontWeight: '700', color: '#27436d' }}>Ciudad</Text>
          <Pressable
            style={{ borderWidth: 1, borderColor: '#d3e2fb', borderRadius: 14, backgroundColor: '#f8fbff', paddingHorizontal: 16, paddingVertical: 12 }}
            onPress={onToggleCitySelector}
          >
            <Text style={{ color: '#18335f' }}>{selectedCity ? selectedCity.name : 'Selecciona ciudad'}</Text>
          </Pressable>

          {isCitySelectorOpen ? (
            <ScrollView style={{ maxHeight: 160, marginTop: 8, borderWidth: 1, borderColor: '#d6e4fb', borderRadius: 14, backgroundColor: '#fafdff' }} nestedScrollEnabled>
              {COLOMBIAN_CITIES.map((city) => (
                <Pressable
                  style={{ borderBottomWidth: 1, borderBottomColor: '#e8effd', paddingHorizontal: 16, paddingVertical: 12 }}
                  key={city.id}
                  onPress={() => onSelectCity(city)}
                >
                  <Text style={{ color: '#20375d' }}>{city.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <Text style={{ marginTop: 12, marginBottom: 6, fontSize: 13, fontWeight: '700', color: '#27436d' }}>Evento asociado</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {events.map((eventItem) => {
                const isSelected = selectedEventId === eventItem.id;
                return (
                  <Pressable
                    style={{ borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, borderColor: isSelected ? '#1f5fe0' : '#d6e3fb', backgroundColor: isSelected ? '#e8f0ff' : '#fff' }}
                    key={eventItem.id}
                    onPress={() => onSelectEvent(eventItem.id)}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#1f4fb6' : '#4a6083' }}>{eventItem.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {pickupSubmitError ? (
            <Text style={{ marginTop: 10, backgroundColor: '#ffecef', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#9f2238' }}>{pickupSubmitError}</Text>
          ) : null}

          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable
              style={{ borderWidth: 1, borderColor: '#d3def3', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 }}
              onPress={onCancel}
            >
              <Text style={{ fontWeight: '700', color: '#3a5176' }}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={{ borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12, backgroundColor: canCreatePickup ? '#1f5fe0' : '#9db8e5' }}
              disabled={!canCreatePickup}
              onPress={onSubmit}
            >
              <Text style={{ fontWeight: '700', color: '#fff' }}>{isCreatingPickup ? 'Creando...' : 'Crear punto'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      );
    }

  const eventsById = useMemo(
    () => new Map(events.map((eventItem) => [eventItem.id, eventItem])),
    [events]
  );

  const canCreatePickup =
    pickupName.trim().length >= 3 &&
    pickupAddress.trim().length >= 5 &&
    Boolean(selectedCity) &&
    Boolean(selectedEventId) &&
    !isCreatingPickup;

  const canCreateShipment =
    Boolean(selectedCampaignIdForShipment) &&
    Boolean(selectedPickupPointIdForShipment) &&
    !isCreatingShipment;

  const loadData = useCallback(async () => {
    if (!currentUser?.accessToken) {
      setIsLoading(false);
      setLoadError('Tu sesión expiró. Inicia sesión nuevamente.');
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const [eventsResponse, campaignsResponse, pickupPointsResponse, usersResponse, shipmentsResponse] = await Promise.all([
        getEvents(),
        getCampaigns(),
        getPickupPoints(1, 100, currentUser.accessToken),
        getUsers(),
        getShipments(1, 100, currentUser.accessToken),
      ]);

      setEvents(eventsResponse.data);
      setCampaigns(campaignsResponse.data);
      setPickupPoints(pickupPointsResponse.data);
      rememberPickupPoints(pickupPointsResponse.data);
      setShipments(shipmentsResponse.data);
      const volunteersById = new Map<number, UserSummary>();
      for (const u of usersResponse.data) {
        if (u?.role === 'volunteer' && u?.id != null && !volunteersById.has(u.id)) {
          volunteersById.set(u.id, u);
        }
      }
      setVolunteers(Array.from(volunteersById.values()));
      setSelectedEventId((current) => current ?? eventsResponse.data[0]?.id ?? null);
      setSelectedCampaignIdForShipment((current) => current ?? campaignsResponse.data[0]?.id ?? null);
      setSelectedPickupPointIdForShipment((current) => current ?? pickupPointsResponse.data[0]?.id ?? null);
    } catch (error) {
      if (getErrorMessage(error).toLowerCase().includes('authentication token is required')) {
        logout();
      }
      setLoadError(`No fue posible cargar logistica. ${getErrorMessage(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, logout]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectCity = (city: ColombianCity) => {
    setSelectedCity(city);
    setIsCitySelectorOpen(false);
  };

  const handleCreatePickupPoint = async () => {
    if (!selectedCity || !selectedEventId) {
      return;
    }

    if (!currentUser?.accessToken) {
      setPickupSubmitError('Tu sesión expiró. Inicia sesión nuevamente.');
      logout();
      return;
    }

    setIsCreatingPickup(true);
    setPickupSubmitError(null);

    try {
      const createdPickupPoint = await createPickupPoint({
        name: pickupName.trim(),
        address: pickupAddress.trim(),
        city: selectedCity.name,
        eventId: selectedEventId,
      }, currentUser.accessToken);

      setPickupPoints((prev) => [createdPickupPoint, ...prev]);
      rememberPickupPoint(createdPickupPoint);
      setPickupName('');
      setPickupAddress('');
      setSelectedCity(null);
      setIsCreatePickupOpen(false);
    } catch (error) {
      setPickupSubmitError(`No se pudo crear el punto. ${getErrorMessage(error)}`);
    } finally {
      setIsCreatingPickup(false);
    }
  };

  const handleCreateShipment = async () => {
    if (!selectedCampaignIdForShipment || !selectedPickupPointIdForShipment) {
      return;
    }

    if (!currentUser?.accessToken) {
      setShipmentSubmitError('Tu sesión expiró. Inicia sesión nuevamente.');
      logout();
      return;
    }

    setIsCreatingShipment(true);
    setShipmentSubmitError(null);

    try {
      const createdShipment = await createShipment(
        {
          campaignId: selectedCampaignIdForShipment,
          pickupPointId: selectedPickupPointIdForShipment,
        },
        currentUser.accessToken
      );

      setShipments((prev) => [createdShipment, ...prev]);
      setIsCreateShipmentOpen(false);
      setAssignmentFeedback('Envío creado correctamente. Ya puedes asignarlo a un voluntario.');
    } catch (error) {
      setShipmentSubmitError(`No se pudo crear el envío. ${getErrorMessage(error)}`);
    } finally {
      setIsCreatingShipment(false);
    }
  };

  const handleOpenAssignment = (volunteer: UserSummary) => {
    setSelectedVolunteerForAssignment(volunteer);
    setSelectedCampaignForAssignment((current) => current ?? campaigns[0]?.id ?? null);
    setAssignmentFeedback(null);
  };

  const handleAssignVolunteerToCampaign = async () => {
    if (!selectedVolunteerForAssignment || !selectedCampaignForAssignment) {
      setAssignmentFeedback('Selecciona voluntario y campana.');
      return;
    }

    if (!currentUser?.accessToken) {
      setAssignmentFeedback('Tu sesión expiró. Inicia sesión nuevamente.');
      logout();
      return;
    }

    const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignForAssignment);

    if (!selectedCampaign) {
      setAssignmentFeedback('No se encontro la campaña seleccionada.');
      return;
    }

    const selectedCampaignId = toNumberId(selectedCampaign.id);
    const selectedEventIdValue = toNumberId(selectedCampaign.eventId);

    const shipmentToAssign = shipments.find((shipment) => {
      const shipmentCampaignId = getShipmentCampaignId(shipment);
      const shipmentEventId = getShipmentEventId(shipment);
      const belongsToCampaign =
        selectedCampaignId !== null && shipmentCampaignId !== null && shipmentCampaignId === selectedCampaignId;
      const belongsToEventFallback =
        selectedEventIdValue !== null && shipmentEventId !== null && shipmentEventId === selectedEventIdValue;
      const isUnassigned = shipment.assignedVolunteerId === null || shipment.assignedVolunteerId === undefined;
      const normalizedStatus = getNormalizedShipmentStatus(shipment);
      const isAssignableStatus = normalizedStatus === 'pending' || normalizedStatus === 'assigned';

      return (belongsToCampaign || belongsToEventFallback) && isUnassigned && isAssignableStatus;
    });

    if (!shipmentToAssign) {
      const relatedShipments = shipments.filter((shipment) => {
        const shipmentCampaignId = getShipmentCampaignId(shipment);
        const shipmentEventId = getShipmentEventId(shipment);
        const belongsToCampaign =
          selectedCampaignId !== null && shipmentCampaignId !== null && shipmentCampaignId === selectedCampaignId;
        const belongsToEventFallback =
          selectedEventIdValue !== null && shipmentEventId !== null && shipmentEventId === selectedEventIdValue;

        return belongsToCampaign || belongsToEventFallback;
      });

      const assignableRelatedShipments = relatedShipments.filter((shipment) => {
        const isUnassigned = shipment.assignedVolunteerId === null || shipment.assignedVolunteerId === undefined;
        const normalizedStatus = getNormalizedShipmentStatus(shipment);
        return isUnassigned && (normalizedStatus === 'pending' || normalizedStatus === 'assigned');
      });

      setAssignmentFeedback(
        `No hay envíos pendientes para esta campaña. Relacionados: ${relatedShipments.length}, asignables: ${assignableRelatedShipments.length}.`
      );
      return;
    }

    setIsAssigningVolunteer(true);
    setAssignmentFeedback(null);

    try {
      const updatedShipment = await assignShipmentVolunteer(
        shipmentToAssign.id,
        selectedVolunteerForAssignment.id,
        currentUser.accessToken
      );

      setShipments((prev) =>
        prev.map((shipment) => (shipment.id === updatedShipment.id ? updatedShipment : shipment))
      );

      setAssignmentFeedback('Voluntario asignado correctamente.');
      setSelectedVolunteerForAssignment(null);
      setSelectedCampaignForAssignment(null);
    } catch (error) {
      setAssignmentFeedback(`No se pudo asignar el voluntario. ${getErrorMessage(error)}`);
    } finally {
      setIsAssigningVolunteer(false);
    }
  };

  const inTransitCount = shipments.filter((s) => s.status === 'in_transit').length;
  const activeShipmentsCount = shipments.filter((shipment) => {
    const status = getNormalizedShipmentStatus(shipment);
    return status === 'pending' || status === 'assigned' || status === 'in_transit';
  }).length;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f4f6fb' }}>
      <View style={{ flex: 1, paddingLeft: organizerWebInset }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: isWeb ? 24 : 120,
          paddingHorizontal: isWeb ? 16 : 0,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            width: '100%',
            maxWidth: isWeb ? 1760 : undefined,
            alignSelf: 'center',
            paddingTop: isWeb ? 8 : 0,
          }}
        >

        {/* ── Header ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: isWeb ? 12 : 20, paddingTop: 16, paddingBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ backgroundColor: '#dce8ff', borderRadius: 16, padding: 12, marginRight: 12 }}>
              <FontAwesome5 color='#1e73fa' name='truck' size={22} />
            </View>
            <View>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#111f3c' }}>Logística</Text>
              {isWeb ? (
                <Text style={{ marginTop: 2, fontSize: 12, color: '#6c7f9d' }}>
                  Panel operativo de distribución y asignación
                </Text>
              ) : null}
            </View>
          </View>
          <Pressable style={{ backgroundColor: '#ebebeb', borderRadius: 16, padding: 12 }}>
            <FontAwesome5 color='#555' name='bell' size={20} />
          </Pressable>
        </View>

        {isWeb ? (
          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 12, marginBottom: 12 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: '#fff',
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderLeftWidth: 3,
                borderLeftColor: '#2563eb',
              }}
            >
              <Text style={{ fontSize: 11, color: '#7c8ba3', fontWeight: '700' }}>ENTREGAS ACTIVAS</Text>
              <Text style={{ marginTop: 2, fontSize: 23, fontWeight: '900', color: '#11284d' }}>
                {activeShipmentsCount}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: '#fff',
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderLeftWidth: 3,
                borderLeftColor: '#06b6d4',
              }}
            >
              <Text style={{ fontSize: 11, color: '#7c8ba3', fontWeight: '700' }}>VOLUNTARIOS DISPONIBLES</Text>
              <Text style={{ marginTop: 2, fontSize: 23, fontWeight: '900', color: '#11284d' }}>
                {volunteers.length}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Nuevo punto de recogida ── */}
        <View
          style={{
            flexDirection: isWeb ? 'row' : 'column',
            gap: 12,
            paddingHorizontal: isWeb ? 12 : 20,
            marginBottom: 18,
          }}
        >
          <Pressable
            onPress={() => setIsCreatePickupOpen((current) => !current)}
            style={{
              flex: 1,
              backgroundColor: '#1e73fa',
              borderRadius: 18,
              paddingVertical: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: isWeb ? '#1e73fa' : undefined,
              shadowOpacity: isWeb ? 0.2 : undefined,
              shadowOffset: isWeb ? { width: 0, height: 6 } : undefined,
              shadowRadius: isWeb ? 14 : undefined,
            }}
          >
            <FontAwesome5 color='#fff' name='map-marker-alt' size={18} style={{ marginRight: 10 }} />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Nuevo punto de recogida</Text>
          </Pressable>

          <Pressable
            onPress={() => setIsCreateShipmentOpen((current) => !current)}
            style={{
              flex: 1,
              backgroundColor: '#0d8383',
              borderRadius: 18,
              paddingVertical: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: isWeb ? '#0d8383' : undefined,
              shadowOpacity: isWeb ? 0.18 : undefined,
              shadowOffset: isWeb ? { width: 0, height: 6 } : undefined,
              shadowRadius: isWeb ? 14 : undefined,
            }}
          >
            <FontAwesome5 color='#fff' name='box-open' size={17} style={{ marginRight: 10 }} />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Nuevo envío</Text>
          </Pressable>
        </View>

        {isCreateShipmentOpen ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ marginHorizontal: isWeb ? 12 : 20, marginBottom: 20, backgroundColor: '#fff', borderRadius: 24, padding: 20, shadowColor: '#163457', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 4 }}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#19335f', marginBottom: 8 }}>Crear envío</Text>
            <Text style={{ fontSize: 12, color: '#60779a', marginBottom: 12 }}>
              Selecciona campaña y punto de recogida para crear un envío asignable.
            </Text>

            <Text style={{ marginBottom: 6, fontSize: 13, fontWeight: '700', color: '#27436d' }}>Campaña</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {campaigns.map((campaignItem) => {
                  const isSelected = selectedCampaignIdForShipment === campaignItem.id;
                  return (
                    <Pressable
                      key={campaignItem.id}
                      onPress={() => setSelectedCampaignIdForShipment(campaignItem.id)}
                      style={{
                        borderWidth: 1,
                        borderRadius: 999,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderColor: isSelected ? '#1f5fe0' : '#d6e3fb',
                        backgroundColor: isSelected ? '#e8f0ff' : '#fff',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#1f4fb6' : '#4a6083' }}>
                        {campaignItem.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={{ marginBottom: 6, fontSize: 13, fontWeight: '700', color: '#27436d' }}>Punto de recogida</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {pickupPoints.map((point) => {
                  const isSelected = selectedPickupPointIdForShipment === point.id;
                  return (
                    <Pressable
                      key={point.id}
                      onPress={() => setSelectedPickupPointIdForShipment(point.id)}
                      style={{
                        borderWidth: 1,
                        borderRadius: 999,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderColor: isSelected ? '#0d8383' : '#d6e3fb',
                        backgroundColor: isSelected ? '#e6fffb' : '#fff',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#0b6f6f' : '#4a6083' }}>
                        {point.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {shipmentSubmitError ? (
              <Text style={{ marginBottom: 10, backgroundColor: '#ffecef', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#9f2238' }}>
                {shipmentSubmitError}
              </Text>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable
                style={{ borderWidth: 1, borderColor: '#d3def3', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 }}
                onPress={() => setIsCreateShipmentOpen(false)}
              >
                <Text style={{ fontWeight: '700', color: '#3a5176' }}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={{ borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12, backgroundColor: canCreateShipment ? '#0d8383' : '#9dcfcf' }}
                disabled={!canCreateShipment}
                onPress={handleCreateShipment}
              >
                <Text style={{ fontWeight: '700', color: '#fff' }}>{isCreatingShipment ? 'Creando...' : 'Crear envío'}</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        ) : null}

        {/* ── Create pickup form ── */}
        {isCreatePickupOpen ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ marginHorizontal: isWeb ? 12 : 20, marginBottom: 20, backgroundColor: '#fff', borderRadius: 24, padding: 20, shadowColor: '#163457', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 4 }}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#19335f', marginBottom: 4 }}>Crear punto de recogida</Text>

            <Text style={{ marginTop: 12, marginBottom: 4, fontSize: 13, fontWeight: '700', color: '#27436d' }}>Nombre</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#d3e2fb', borderRadius: 14, backgroundColor: '#f8fbff', paddingHorizontal: 16, paddingVertical: 12, color: '#18335f' }}
              onChangeText={setPickupName}
              placeholder='Ej: Punto norte de donaciones'
              placeholderTextColor='#8ea6c8'
              value={pickupName}
            />

            <Text style={{ marginTop: 12, marginBottom: 4, fontSize: 13, fontWeight: '700', color: '#27436d' }}>Direccion</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#d3e2fb', borderRadius: 14, backgroundColor: '#f8fbff', paddingHorizontal: 16, paddingVertical: 12, color: '#18335f' }}
              onChangeText={setPickupAddress}
              placeholder='Ej: Cra 15 # 102-30'
              placeholderTextColor='#8ea6c8'
              value={pickupAddress}
            />

            <Text style={{ marginTop: 12, marginBottom: 4, fontSize: 13, fontWeight: '700', color: '#27436d' }}>Ciudad</Text>
            <Pressable
              style={{ borderWidth: 1, borderColor: '#d3e2fb', borderRadius: 14, backgroundColor: '#f8fbff', paddingHorizontal: 16, paddingVertical: 12 }}
              onPress={() => setIsCitySelectorOpen((current) => !current)}
            >
              <Text style={{ color: '#18335f' }}>{selectedCity ? selectedCity.name : 'Selecciona ciudad'}</Text>
            </Pressable>

            {isCitySelectorOpen ? (
              <ScrollView style={{ maxHeight: 160, marginTop: 8, borderWidth: 1, borderColor: '#d6e4fb', borderRadius: 14, backgroundColor: '#fafdff' }} nestedScrollEnabled>
                {COLOMBIAN_CITIES.map((city) => (
                  <Pressable
                    style={{ borderBottomWidth: 1, borderBottomColor: '#e8effd', paddingHorizontal: 16, paddingVertical: 12 }}
                    key={city.id}
                    onPress={() => handleSelectCity(city)}
                  >
                    <Text style={{ color: '#20375d' }}>{city.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <Text style={{ marginTop: 12, marginBottom: 6, fontSize: 13, fontWeight: '700', color: '#27436d' }}>Evento asociado</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {events.map((eventItem) => {
                  const isSelected = selectedEventId === eventItem.id;

                  return (
                    <Pressable
                      style={{ borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, borderColor: isSelected ? '#1f5fe0' : '#d6e3fb', backgroundColor: isSelected ? '#e8f0ff' : '#fff' }}
                      key={eventItem.id}
                      onPress={() => setSelectedEventId(eventItem.id)}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#1f4fb6' : '#4a6083' }}>{eventItem.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {pickupSubmitError ? (
              <Text style={{ marginTop: 10, backgroundColor: '#ffecef', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#9f2238' }}>{pickupSubmitError}</Text>
            ) : null}

            <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable
                style={{ borderWidth: 1, borderColor: '#d3def3', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 }}
                onPress={() => setIsCreatePickupOpen(false)}
              >
                <Text style={{ fontWeight: '700', color: '#3a5176' }}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={{ borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12, backgroundColor: canCreatePickup ? '#1f5fe0' : '#9db8e5' }}
                disabled={!canCreatePickup}
                onPress={handleCreatePickupPoint}
              >
                <Text style={{ fontWeight: '700', color: '#fff' }}>{isCreatingPickup ? 'Creando...' : 'Crear punto'}</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        ) : null}


        {/* ── Loading / Error ── */}
        {isLoading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: isWeb ? 12 : 20, marginBottom: 12 }}>
            <ActivityIndicator color='#1e73fa' size='small' />
            <Text style={{ marginLeft: 8, fontSize: 13, color: '#50698e' }}>Cargando logistica...</Text>
          </View>
        ) : null}

        {loadError ? (
          <View style={{ marginHorizontal: isWeb ? 12 : 20, marginBottom: 12, backgroundColor: '#ffecef', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ fontSize: 13, color: '#a0253c' }}>{loadError}</Text>
          </View>
        ) : null}

        {/* ── Puntos de recogida ── */}
        <View style={{ marginBottom: 24, marginHorizontal: isWeb ? 12 : 0, backgroundColor: isWeb ? '#fff' : 'transparent', borderRadius: isWeb ? 22 : 0, paddingVertical: isWeb ? 16 : 0, paddingHorizontal: isWeb ? 14 : 0, borderWidth: isWeb ? 1 : 0, borderColor: '#e7eef9' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: isWeb ? 0 : 20, marginBottom: 14 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#111f3c' }}>Puntos de recogida</Text>
            <Pressable onPress={loadData}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#1e73fa' }}>Ver todos</Text>
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: isWeb ? 0 : 20 }}>
            {pickupPoints.length === 0 ? (
              <View style={{ justifyContent: 'center', paddingVertical: 20 }}>
                <Text style={{ fontSize: 14, color: '#9ca3af' }}>Sin puntos registrados</Text>
              </View>
            ) : (
              pickupPoints.map((point, idx) => {
                const event = eventsById.get(point.eventId);
                const bgColors = ['#b8d4e8', '#c5d8ee', '#a8c8e0', '#ccdff0', '#bbd0e8'];
                const bg = bgColors[idx % bgColors.length];
                return <PickupPointCard key={point.id} point={point} event={event} bgColor={bg} />;
              })
            )}
          </ScrollView>
        </View>

        {/* ── Envíos registrados ── */}
        <View style={{ paddingHorizontal: isWeb ? 12 : 20, marginBottom: 24 }}>
          <View style={{ backgroundColor: isWeb ? '#fff' : 'transparent', borderRadius: isWeb ? 22 : 0, borderWidth: isWeb ? 1 : 0, borderColor: '#e7eef9', paddingHorizontal: isWeb ? 14 : 0, paddingVertical: isWeb ? 16 : 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#111f3c' }}>Envíos registrados</Text>
            {inTransitCount > 0 ? (
              <View style={{ backgroundColor: '#dce8ff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#1e40af', letterSpacing: 0.5 }}>{inTransitCount} EN CAMINO</Text>
              </View>
            ) : null}
          </View>

          {shipments.length === 0 ? (
            <Text style={{ fontSize: 14, color: '#9ca3af' }}>No hay envios registrados.</Text>
          ) : (
            shipments.map((shipment) => <ShipmentRow key={shipment.id} shipment={shipment} />)
          )}
          </View>
        </View>

        {/* ── Voluntarios disponibles ── */}
        <View style={{ paddingHorizontal: isWeb ? 12 : 20, marginBottom: 24 }}>
          <View style={{ backgroundColor: isWeb ? '#fff' : 'transparent', borderRadius: isWeb ? 22 : 0, borderWidth: isWeb ? 1 : 0, borderColor: '#e7eef9', paddingHorizontal: isWeb ? 14 : 0, paddingVertical: isWeb ? 16 : 0 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: '#111f3c', marginBottom: 14 }}>Voluntarios disponibles</Text>

          {volunteers.length === 0 ? (
            <Text style={{ fontSize: 14, color: '#9ca3af' }}>No hay voluntarios disponibles.</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {volunteers.map((volunteer) => (
                <VolunteerCard
                  key={volunteer.id}
                  volunteer={volunteer}
                  onAssign={handleOpenAssignment}
                  isAssigning={isAssigningVolunteer && selectedVolunteerForAssignment?.id === volunteer.id}
                  isWeb={isWeb}
                />
              ))}
            </View>
          )}

          {selectedVolunteerForAssignment ? (
            <View style={{ marginTop: 10, backgroundColor: '#fff', borderRadius: 16, padding: 14 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#1b3259', marginBottom: 8 }}>
                Asignar {selectedVolunteerForAssignment.fullName ?? selectedVolunteerForAssignment.name ?? 'voluntario'} a campaña
              </Text>

              {campaigns.length === 0 ? (
                <Text style={{ fontSize: 13, color: '#9ca3af', marginBottom: 10 }}>No hay campañas disponibles.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {campaigns.map((campaignItem) => {
                      const isSelectedCampaign = selectedCampaignForAssignment === campaignItem.id;
                      return (
                        <Pressable
                          key={campaignItem.id}
                          onPress={() => setSelectedCampaignForAssignment(campaignItem.id)}
                          style={{
                            borderWidth: 1,
                            borderRadius: 999,
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderColor: isSelectedCampaign ? '#1f5fe0' : '#d6e3fb',
                            backgroundColor: isSelectedCampaign ? '#e8f0ff' : '#fff',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: isSelectedCampaign ? '#1f4fb6' : '#4a6083' }}>
                            {campaignItem.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Pressable
                  onPress={() => {
                    setSelectedVolunteerForAssignment(null);
                    setSelectedCampaignForAssignment(null);
                    setAssignmentFeedback(null);
                  }}
                  style={{ borderWidth: 1, borderColor: '#d3def3', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}
                >
                  <Text style={{ fontWeight: '700', color: '#3a5176' }}>Cancelar</Text>
                </Pressable>

                <Pressable
                  onPress={handleAssignVolunteerToCampaign}
                  disabled={isAssigningVolunteer || campaigns.length === 0}
                  style={{
                    borderRadius: 12,
                    paddingHorizontal: 18,
                    paddingVertical: 10,
                    backgroundColor: isAssigningVolunteer || campaigns.length === 0 ? '#9db8e5' : '#1f5fe0',
                  }}
                >
                  <Text style={{ fontWeight: '700', color: '#fff' }}>{isAssigningVolunteer ? 'Asignando...' : 'Confirmar'}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {assignmentFeedback ? (
            <Text
              style={{
                marginTop: 10,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 13,
                color: assignmentFeedback.includes('correctamente') ? '#166534' : '#9f2238',
                backgroundColor: assignmentFeedback.includes('correctamente') ? '#e8f7ec' : '#ffecef',
              }}
            >
              {assignmentFeedback}
            </Text>
          ) : null}
          </View>
        </View>

      </View>
      </ScrollView>
      </View>

      <OrganizerBottomTabs activeTab='logistica' />
    </SafeAreaView>
  );
}
