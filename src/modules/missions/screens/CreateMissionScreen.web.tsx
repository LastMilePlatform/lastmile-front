import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useRouter } from 'expo-router';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import 'leaflet/dist/leaflet.css';

import {
  COLOMBIAN_CITIES,
  type ColombianCity,
  findColombianCityByName,
} from '@/modules/missions/constants/colombianCities';
import { createEvent, type EventSummary, getEvents } from '@/services/api/eventsService';
import { getPickupPoints, type PickupPoint } from '@/services/api/logisticsService';
import { getRememberedPickupPoints, rememberPickupPoints } from '@/services/state/pickupPointsMemory';
import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';
import {
  connectRealtime,
  emitRealtime,
  joinRealtimeRoom,
  leaveRealtimeRoom,
  onRealtime,
} from '@/services/realtime/realtimeService';

type VolunteerMarker = {
  userId: number;
  name: string;
  lat: number;
  lng: number;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeVolunteerMarker(payload: unknown): VolunteerMarker | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const value =
    (root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : null) ??
    (root.location && typeof root.location === 'object' ? { ...root, ...(root.location as Record<string, unknown>) } : null) ??
    root;

  const coordinates = Array.isArray(value.coordinates) ? value.coordinates : null;
  const latFromArray = coordinates ? toFiniteNumber(coordinates[1]) : null;
  const lngFromArray = coordinates ? toFiniteNumber(coordinates[0]) : null;

  const lat = toFiniteNumber(value.lat ?? value.latitude) ?? latFromArray;
  const lng = toFiniteNumber(value.lng ?? value.longitude) ?? lngFromArray;
  const rawId = toFiniteNumber(
    value.userId ?? value.volunteerId ?? value.id ?? value.updatedBy ?? value.updated_by
  );

  if (lat === null || lng === null || rawId === null) {
    return null;
  }

  const fallbackName = `Voluntario ${rawId}`;
  const name =
    typeof value.name === 'string'
      ? value.name
      : typeof value.fullName === 'string'
        ? value.fullName
        : typeof value.userName === 'string'
          ? value.userName
          : typeof value.volunteerName === 'string'
            ? value.volunteerName
            : fallbackName;

  return {
    userId: rawId,
    name,
    lat,
    lng,
  };
}

function normalizeVolunteerSnapshot(payload: unknown): VolunteerMarker[] {
  let collection: unknown[] = [];

  if (Array.isArray(payload)) {
    collection = payload;
  } else if (payload && typeof payload === 'object') {
    const value = payload as Record<string, unknown>;

    if (Array.isArray(value.volunteers)) {
      collection = value.volunteers;
    } else if (Array.isArray(value.data)) {
      collection = value.data;
    } else if (Array.isArray(value.items)) {
      collection = value.items;
    } else if (Array.isArray(value.points)) {
      collection = value.points;
    }
  }

  const byId = new Map<number, VolunteerMarker>();

  collection.forEach((item) => {
    const normalized = normalizeVolunteerMarker(item);

    if (normalized) {
      byId.set(normalized.userId, normalized);
    }
  });

  return Array.from(byId.values());
}

const DEFAULT_CREATED_BY = 1;
const DEFAULT_DISASTER_TYPE = 'desastre_natural';
const COLOMBIA_CENTER: [number, number] = [4.5709, -74.2973];

type OrganizerNavItem = Readonly<{
  id: string;
  label: string;
  icon: ComponentProps<typeof MaterialIcons>['name'];
  route: string;
  isActive?: boolean;
}>;

type SummaryPillProps = Readonly<{
  label: string;
  value: string;
  accent: string;
}>;

function SummaryPill({ label, value, accent }: SummaryPillProps) {
  return (
    <View className='rounded-2xl border border-[#dce7fb] bg-white px-4 py-3 shadow-[0_8px_20px_rgba(20,40,80,0.06)]'>
      <Text className='text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6f7f9b]'>{label}</Text>
      <Text className='mt-1 text-sm font-bold text-[#17325b]'>{value}</Text>
      <View className='mt-2 h-1.5 w-16 rounded-full' style={{ backgroundColor: accent }} />
    </View>
  );
}

function SideNavItem({ label, icon, route, isActive, onPress }: OrganizerNavItem & { onPress: (route: string) => void }) {
  return (
    <Pressable
      className={`mb-2 flex-row items-center rounded-2xl px-3 py-3 ${isActive ? 'bg-[#eaf2ff]' : 'bg-transparent'}`}
      onPress={() => onPress(route)}
    >
      <View className={`h-9 w-9 items-center justify-center rounded-xl ${isActive ? 'bg-[#0a63ff]' : 'bg-[#edf3fb]'}`}>
        <MaterialIcons color={isActive ? '#fff' : '#5d708d'} name={icon} size={18} />
      </View>
      <Text className={`ml-3 text-sm font-semibold ${isActive ? 'text-[#0e3472]' : 'text-[#55708f]'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

type RecenterMapProps = Readonly<{
  location: [number, number] | null;
  commandId: number;
  locateCommandId: number;
  onLocationResolved: (location: [number, number]) => void;
  onLocateFinished: (ok: boolean) => void;
}>;

function RecenterMap({
  location,
  commandId,
  locateCommandId,
  onLocationResolved,
  onLocateFinished,
}: RecenterMapProps) {
  const map = useMap();

  useEffect(() => {
    if (!location || commandId === 0) {
      return;
    }

    map.flyTo(location, 13, {
      animate: true,
      duration: 0.8,
    });
  }, [commandId, location, map]);

  useEffect(() => {
    if (locateCommandId === 0) {
      return;
    }

    const handleLocationFound = (event: { latlng: { lat: number; lng: number } }) => {
      const found: [number, number] = [event.latlng.lat, event.latlng.lng];
      onLocationResolved(found);
      map.flyTo(found, 13, {
        animate: true,
        duration: 0.8,
      });
      onLocateFinished(true);
    };

    const handleLocationError = () => {
      onLocateFinished(false);
    };

    map.once('locationfound', handleLocationFound);
    map.once('locationerror', handleLocationError);
    map.locate({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
      setView: false,
    });

    return () => {
      map.off('locationfound', handleLocationFound);
      map.off('locationerror', handleLocationError);
    };
  }, [locateCommandId, map, onLocateFinished, onLocationResolved]);

  return null;
}

// Helper component to create a dedicated pane for the user's location so it renders above other layers
const MapSetter = ({ onMapReady }: { onMapReady?: (m: any) => void }) => {
  const map = useMap();
  useEffect(() => {
    if (map) {
      try {
        if (!map.getPane('my-location-pane')) {
          map.createPane('my-location-pane');
          const p = map.getPane('my-location-pane');
          if (p && p.style) {
            p.style.zIndex = '700';
            p.style.pointerEvents = 'auto';
          }
        }
      } catch (e) {
        // ignore pane errors
      }

      onMapReady?.(map);
    }
  }, [map, onMapReady]);

  return null;
};

// eslint-disable-next-line sonarjs/cognitive-complexity
export function CreateMissionScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1200;
  const { currentUser } = useAuthSession();
  const [volunteerMarkers, setVolunteerMarkers] = useState<Record<number, VolunteerMarker>>({});
  const volunteerMarkersRef = useRef<Record<number, VolunteerMarker>>({});

  const [isMissionMenuOpen, setIsMissionMenuOpen] = useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [isCitySelectorOpen, setIsCitySelectorOpen] = useState(false);

  const [eventName, setEventName] = useState('');
  const [disasterType, setDisasterType] = useState(DEFAULT_DISASTER_TYPE);
  const [eventDescription, setEventDescription] = useState('');
  const [selectedCity, setSelectedCity] = useState<ColombianCity | null>(null);

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdEventLabel, setCreatedEventLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const [centerCommandId, setCenterCommandId] = useState(0);
  const [locateCommandId, setLocateCommandId] = useState(0);
  const [locationActionError, setLocationActionError] = useState<string | null>(null);

  const canCreateEvent = useMemo(
    () =>
      eventName.trim().length > 2 &&
      disasterType.trim().length > 2 &&
      Boolean(selectedCity) &&
      !isSubmitting,
    [disasterType, eventName, isSubmitting, selectedCity]
  );

  const mappedEvents = useMemo(
    () =>
      events
        .map((eventItem) => {
          const city = findColombianCityByName(eventItem.city);
          const fallbackCity = city ?? COLOMBIAN_CITIES[0];

          return { event: eventItem, city: fallbackCity };
        })
        .filter((eventItem): eventItem is { event: EventSummary; city: ColombianCity } => Boolean(eventItem)),
    [events]
  );

  const mappedPickupPoints = useMemo(
    () =>
      pickupPoints
        .map((pickupPoint) => {
          if (typeof pickupPoint.latitude === 'number' && typeof pickupPoint.longitude === 'number') {
            return {
              pickupPoint,
              latitude: pickupPoint.latitude,
              longitude: pickupPoint.longitude,
            };
          }

          const city = findColombianCityByName(pickupPoint.city);

          if (!city) {
            return null;
          }

          return {
            pickupPoint,
            latitude: city.region.latitude,
            longitude: city.region.longitude,
          };
        })
        .filter(
          (
            item
          ): item is {
            pickupPoint: PickupPoint;
            latitude: number;
            longitude: number;
          } => Boolean(item)
        ),
    [pickupPoints]
  );

  const navItems: OrganizerNavItem[] = [
    { id: 'mapa', label: 'Mapa', icon: 'map', route: '/organizer/create-mission', isActive: true },
    { id: 'campanas', label: 'Campañas', icon: 'campaign', route: '/organizer/campaigns' },
    { id: 'subastas', label: 'Subastas', icon: 'gavel', route: '/organizer/auctions' },
    { id: 'logistica', label: 'Logística', icon: 'local-shipping', route: '/organizer/logistics' },
    { id: 'perfil', label: 'Perfil', icon: 'person', route: '/organizer/profile' },
  ];

  const mapCenter = useMemo<[number, number]>(() => {
    if (mappedEvents.length > 0) {
      return [mappedEvents[0].city.region.latitude, mappedEvents[0].city.region.longitude];
    }

    if (mappedPickupPoints.length > 0) {
      return [mappedPickupPoints[0].latitude, mappedPickupPoints[0].longitude];
    }

    return COLOMBIA_CENTER;
  }, [mappedEvents, mappedPickupPoints]);

  const loadData = useCallback(async () => {
    setIsLoadingEvents(true);
    setLoadError(null);

    const rememberedPickupPoints = getRememberedPickupPoints();

    const eventsPromise = getEvents({ page: 1, limit: 100 });
    const pickupPointsPromise = getPickupPoints().catch(async () => {
      return getPickupPoints(1, 100);
    });

    const [eventsResult, pickupPointsResult] = await Promise.allSettled([
      eventsPromise,
      pickupPointsPromise,
    ]);

    const failedSources: string[] = [];

    if (eventsResult.status === 'fulfilled') {
      setEvents(eventsResult.value.data);
    } else {
      setEvents([]);
      failedSources.push('eventos');
    }

    if (pickupPointsResult.status === 'fulfilled') {
      const mergedById = new Map<number, PickupPoint>();

      rememberedPickupPoints.forEach((item) => {
        mergedById.set(item.id, item);
      });

      pickupPointsResult.value.data.forEach((item) => {
        mergedById.set(item.id, item);
      });

      const mergedPickupPoints = Array.from(mergedById.values()).sort((a, b) => b.id - a.id);
      setPickupPoints(mergedPickupPoints);
      rememberPickupPoints(mergedPickupPoints);
    } else {
      setPickupPoints(rememberedPickupPoints);
      failedSources.push('puntos de recogida');
    }

    if (failedSources.length > 0) {
      setLoadError(`No fue posible cargar: ${failedSources.join(' | ')}.`);
    }

    setIsLoadingEvents(false);
  }, []);

  const refreshEventsSilently = useCallback(async () => {
    try {
      const response = await getEvents({ page: 1, limit: 100 });
      setEvents(response.data);
    } catch {
      // Keep previous events when a background refresh fails.
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!currentUser?.accessToken) return;

    connectRealtime({ token: currentUser.accessToken, userId: currentUser.id, role: currentUser.role });
    joinRealtimeRoom('volunteers:locations');
    joinRealtimeRoom('volunteers:tracking');

    // Request an initial snapshot using common event names. Servers may ignore unknown events.
    emitRealtime('volunteers.locations.snapshot.request', {});
    emitRealtime('volunteer.location.snapshot.request', {});
    emitRealtime('campaign.volunteers.snapshot.request', {});

    const applySnapshot = (payload: unknown) => {
      const normalized = normalizeVolunteerSnapshot(payload);

      if (normalized.length === 0) {
        return;
      }

      const next: Record<number, VolunteerMarker> = {};
      normalized.forEach((item) => {
        next[item.userId] = item;
      });

      volunteerMarkersRef.current = next;
      setVolunteerMarkers({ ...next });
    };

    const applyLocationUpdate = (payload: unknown) => {
      const normalized = normalizeVolunteerMarker(payload);

      if (!normalized) {
        return;
      }

      volunteerMarkersRef.current = {
        ...volunteerMarkersRef.current,
        [normalized.userId]: normalized,
      };
      setVolunteerMarkers({ ...volunteerMarkersRef.current });
    };

    const applyDisconnect = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        return;
      }

      const value = payload as Record<string, unknown>;
      const rawId = toFiniteNumber(value.userId ?? value.volunteerId ?? value.id);

      if (rawId === null) {
        return;
      }

      const next = { ...volunteerMarkersRef.current };
      delete next[rawId];
      volunteerMarkersRef.current = next;
      setVolunteerMarkers({ ...next });
    };

    const offSnapshot = onRealtime('volunteers.locations.snapshot', applySnapshot);
    const offSnapshotLegacy = onRealtime('volunteer.location.snapshot', applySnapshot);
    const offCampaignSnapshot = onRealtime('campaign.volunteers.snapshot', applySnapshot);

    const offUpdated = onRealtime('volunteer.location.updated', applyLocationUpdate);
    const offChanged = onRealtime('volunteer.location.changed', applyLocationUpdate);
    const offDirectUpdate = onRealtime('volunteer.location.update', applyLocationUpdate);

    const offDisconnected = onRealtime('volunteer.disconnected', applyDisconnect);
    const offOffline = onRealtime('volunteer.offline', applyDisconnect);
    const snapshotIntervalId = setInterval(() => {
      emitRealtime('volunteers.locations.snapshot.request', {});
      emitRealtime('volunteer.location.snapshot.request', {});
      emitRealtime('campaign.volunteers.snapshot.request', {});
    }, 10000);

    return () => {
      offSnapshot();
      offSnapshotLegacy();
      offCampaignSnapshot();
      offUpdated();
      offChanged();
      offDirectUpdate();
      offDisconnected();
      offOffline();
      clearInterval(snapshotIntervalId);
      leaveRealtimeRoom('volunteers:locations');
      leaveRealtimeRoom('volunteers:tracking');
    };
  }, [currentUser?.accessToken, currentUser?.id, currentUser?.role]);

  useEffect(() => {
    const refreshId = setInterval(() => {
      void refreshEventsSilently();
    }, 3000);

    return () => {
      clearInterval(refreshId);
    };
  }, [refreshEventsSilently]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    if (!createdEventLabel) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setCreatedEventLabel('');
    }, 4000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [createdEventLabel]);

  const centerMapOnLocation = useCallback((location: [number, number]) => {
    setMyLocation(location);
    setCenterCommandId((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!navigator?.geolocation) {
      return;
    }

    const positionOptions: PositionOptions = {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 5000,
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setMyLocation([position.coords.latitude, position.coords.longitude]);
      },
      () => {
        // Keep the map useful without location permission.
      },
      positionOptions
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const requestUserLocation = useCallback(() => {
    setIsLocatingUser(true);
    setLocationActionError(null);
    setLocateCommandId((current) => current + 1);
  }, []);

  const handleCreateEvent = async () => {
    if (!selectedCity) {
      return;
    }

    const trimmedDescription = eventDescription.trim();

    if (trimmedDescription.length > 0 && trimmedDescription.length < 10) {
      setSubmitError('La descripción del evento debe tener al menos 10 caracteres.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const createdEvent = await createEvent({
        name: eventName.trim(),
        disasterType: disasterType.trim(),
        city: selectedCity.name,
        description: trimmedDescription || 'Evento registrado desde la vista web',
        date: new Date().toISOString(),
        createdBy: DEFAULT_CREATED_BY,
      });

      setEvents((prev) => [createdEvent, ...prev]);
      setCreatedEventLabel(`${createdEvent.name} - ${createdEvent.city}`);
      setEventName('');
      setDisasterType(DEFAULT_DISASTER_TYPE);
      setEventDescription('');
      setSelectedCity(null);
      setIsCreateEventOpen(false);
      setIsMissionMenuOpen(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'No se pudo crear el evento.';
      setSubmitError(`No se pudo crear el evento. ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className='flex-1 bg-[#dce9f5]'>
      <View className='flex-1 px-3 pb-3 pt-3'>
        <View className='mb-3 flex-row items-center justify-between rounded-[28px] border border-[#d6e4fb] bg-white/90 px-4 py-3 shadow-[0_8px_22px_rgba(15,31,61,0.06)]'>
          <View>
            <Text className='mt-1 text-2xl font-extrabold text-[#16325d]'>
              Bienvenido Organizador
            </Text>
            <Text className='mt-1 text-sm text-[#5a7190]'>
              Gestiona eventos y mapa esde este panel.
            </Text>
          </View>

          <View className='flex-row items-center gap-2 rounded-full bg-[#eef5ff] px-3 py-1.5'>
            <View className='h-2.5 w-2.5 rounded-full bg-[#49c9ad]' />
            <Text className='text-xs font-bold uppercase tracking-[0.22em] text-[#35537d]'>Sistema activo</Text>
          </View>
        </View>

        <View className={`${isDesktop ? 'flex-row' : 'flex-col'} flex-1 gap-3`}>
          <View className={`${isDesktop ? 'w-[250px]' : 'w-full'} rounded-[30px] border border-[#d6e3fb] bg-white px-4 py-5 shadow-[0_12px_26px_rgba(16,34,68,0.08)]`}>
            <Text className='text-xs font-semibold uppercase tracking-[0.28em] text-[#6d7e9a]'>
              Lastmile
            </Text>
            <Text className='mt-1 text-sm text-[#5a7190]'>
              Operador de logística y coordinación de misiones.
            </Text>

            <View className='mt-6'>
              {navItems.map((item) => (
                <SideNavItem key={item.id} {...item} onPress={(route) => router.push(route as never)} />
              ))}
            </View>

            <View className='mt-6 rounded-2xl bg-[#f7fbff] px-4 py-4'>
              <Text className='text-xs font-semibold uppercase tracking-[0.22em] text-[#6f7f9b]'>
                Acciones
              </Text>
              <Pressable
                className='mt-3 rounded-2xl bg-[#0a63ff] px-4 py-3 shadow-[0_10px_20px_rgba(10,99,255,0.22)]'
                onPress={() => setIsMissionMenuOpen((current) => !current)}
              >
                <Text className='text-center text-sm font-semibold text-white'>Nueva misión</Text>
              </Pressable>
              {isMissionMenuOpen ? (
                <View className='mt-3 rounded-2xl border border-[#d8e7ff] bg-white p-3'>
                  <Pressable
                    className='flex-row items-center rounded-xl bg-[#f4f8ff] px-3 py-3'
                    onPress={() => {
                      setIsCreateEventOpen(true);
                      setIsMissionMenuOpen(false);
                    }}
                  >
                    <MaterialIcons color='#2f68d8' name='warning-amber' size={20} />
                    <Text className='ml-2 text-sm font-semibold text-[#1d3357]'>Crear Evento (Desastre)</Text>
                  </Pressable>
                </View>
              ) : null}
              <Text className='mt-3 text-xs leading-5 text-[#60738f]'>
                Usa este acceso para ver las opciones de misión y abrir la acción que necesites.
              </Text>
            </View>

          </View>

            <View className={`${isDesktop ? 'flex-1' : 'w-full'} min-h-[760px] relative overflow-hidden rounded-[34px] border border-[#d2e1f8] bg-[#f6faff] shadow-[0_18px_42px_rgba(19,39,78,0.12)]`}>
            <View className='absolute left-0 right-0 top-0 bottom-0' style={{ zIndex: 0 }}>
              <MapContainer
                center={mapCenter}
                style={{ height: '100%', width: '100%' }}
                zoom={6}
              >
                <MapSetter />
                <RecenterMap
                  commandId={centerCommandId}
                  locateCommandId={locateCommandId}
                  location={myLocation}
                  onLocateFinished={(ok) => {
                    setIsLocatingUser(false);

                    if (!ok) {
                      setLocationActionError('No fue posible obtener tu ubicación. Verifica permisos del navegador.');
                    }
                  }}
                  onLocationResolved={(location) => {
                    setLocationActionError(null);
                    setMyLocation(location);
                  }}
                />
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                />

                {mappedEvents.map(({ event, city }) => (
                  <CircleMarker
                    center={[city.region.latitude, city.region.longitude]}
                    key={`event-${event.id}`}
                    pathOptions={{ color: '#e03b3b', fillColor: '#ff6b6b', fillOpacity: 0.92 }}
                    radius={9}
                  >
                    <Popup>
                      <strong>{event.name}</strong>
                      <br />
                      {event.description || 'Sin descripcion'}
                      <br />
                      {event.city}
                    </Popup>
                  </CircleMarker>
                ))}

                {mappedPickupPoints.map(({ pickupPoint, latitude, longitude }) => (
                  <CircleMarker
                    center={[latitude, longitude]}
                    key={`pickup-${pickupPoint.id}`}
                    pathOptions={{ color: '#1f5fe0', fillColor: '#2a7fff', fillOpacity: 0.92 }}
                    radius={8}
                  >
                    <Popup>
                      <strong>Punto de recogida: {pickupPoint.name}</strong>
                      <br />
                      {pickupPoint.address}
                      <br />
                      {pickupPoint.city}
                    </Popup>
                  </CircleMarker>
                ))}

                {Object.values(volunteerMarkers).map((v) => (
                  <CircleMarker
                    center={[v.lat, v.lng]}
                    key={`volunteer-${v.userId}`}
                    pathOptions={{ color: '#15803d', fillColor: '#22c55e', fillOpacity: 0.95 }}
                    radius={10}
                  >
                    <Popup>
                      <strong>Voluntario: {v.name}</strong>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </View>

            <View className='absolute left-4 right-4 top-4 flex-row flex-wrap gap-3' style={{ pointerEvents: 'none', zIndex: 45 }}>
              <SummaryPill label='Operaciones' value={`${mappedEvents.length} activas`} accent='#0a63ff' />
              <SummaryPill label='Voluntarios' value={`${Object.keys(volunteerMarkers).length} en línea`} accent='#22c55e' />
              <SummaryPill label='Recogidas' value={`${mappedPickupPoints.length} puntos`} accent='#7a95c9' />
            </View>

            <View
              className='absolute left-4 bottom-4 rounded-2xl border border-[#d8e7fb] bg-white/95 px-4 py-3 shadow-[0_12px_28px_rgba(14,28,56,0.14)]'
              style={{ pointerEvents: 'none', zIndex: 45 }}
            >
              <View className='flex-row items-center gap-2'>
                <View className='h-8 w-8 items-center justify-center rounded-full bg-[#eaf1ff]'>
                  <MaterialIcons color='#1f5fe0' name='my-location' size={18} />
                </View>
                <View>
                  <Text className='text-xs font-semibold uppercase tracking-[0.2em] text-[#6f7f9b]'>
                    Estado del mapa
                  </Text>
                  <Text className='text-sm font-semibold text-[#16325d]'>
                    {isLoadingEvents ? 'Cargando datos' : 'Vista lista para operar'}
                  </Text>
                </View>
              </View>
            </View>

          </View>
        </View>
      </View>

      {isCreateEventOpen ? (
        <View
          className='absolute left-0 right-0 top-0 bottom-0 items-center justify-center bg-[#0a1a35]/45 px-4 py-6'
          style={{ zIndex: 120 }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className='w-full max-w-2xl'
          >
            <View className='max-h-[86vh] overflow-hidden rounded-[30px] border border-[#d5e3fb] bg-[#fbfdff]'>
              <View className='flex-row items-center justify-between border-b border-[#e9f0fb] px-5 py-4'>
                <Text className='text-lg font-extrabold text-[#14243f]'>Crear Evento de Desastre Natural</Text>
                <Pressable
                  className='h-9 w-9 items-center justify-center rounded-full bg-[#edf3ff]'
                  onPress={() => {
                    setIsCreateEventOpen(false);
                    setIsCitySelectorOpen(false);
                  }}
                >
                  <MaterialIcons color='#305c9d' name='close' size={20} />
                </Pressable>
              </View>

              <ScrollView className='px-5 py-4'>
                <Text className='mb-2 text-sm font-semibold text-[#233b61]'>Nombre del evento</Text>
                <TextInput
                  className='rounded-xl border border-[#cfe0fb] bg-white px-4 py-3 text-[#13274a]'
                  onChangeText={setEventName}
                  placeholder='Ej: Inundación por lluvias intensas'
                  placeholderTextColor='#8ba2c3'
                  value={eventName}
                />

                <Text className='mb-2 mt-4 text-sm font-semibold text-[#233b61]'>Tipo de desastre</Text>
                <TextInput
                  className='rounded-xl border border-[#cfe0fb] bg-white px-4 py-3 text-[#13274a]'
                  onChangeText={setDisasterType}
                  placeholder='Ej: inundacion'
                  placeholderTextColor='#8ba2c3'
                  value={disasterType}
                />

                <Text className='mb-2 mt-4 text-sm font-semibold text-[#233b61]'>Descripción</Text>
                <TextInput
                  className='rounded-xl border border-[#cfe0fb] bg-white px-4 py-3 text-[#13274a]'
                  multiline
                  numberOfLines={4}
                  onChangeText={setEventDescription}
                  placeholder='Describe el evento'
                  placeholderTextColor='#8ba2c3'
                  style={{ minHeight: 96, textAlignVertical: 'top' }}
                  value={eventDescription}
                />

                <Text className='mb-2 mt-4 text-sm font-semibold text-[#233b61]'>Ciudad</Text>
                <Pressable
                  className='rounded-xl border border-[#cfe0fb] bg-white px-4 py-3'
                  onPress={() => setIsCitySelectorOpen((current) => !current)}
                >
                  <Text className='text-[#1b3357]'>
                    {selectedCity ? selectedCity.name : 'Selecciona una ciudad de Colombia'}
                  </Text>
                </Pressable>

                {isCitySelectorOpen ? (
                  <ScrollView className='mt-3 max-h-40 rounded-xl border border-[#d6e4fb] bg-[#fafdff]'>
                    {COLOMBIAN_CITIES.map((city) => (
                      <Pressable
                        className='border-b border-[#e8effd] px-4 py-3'
                        key={city.id}
                        onPress={() => {
                          setSelectedCity(city);
                          setIsCitySelectorOpen(false);
                        }}
                      >
                        <Text className='text-[#20375d]'>{city.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}

                {submitError ? <Text className='mt-3 text-sm text-[#c3324d]'>{submitError}</Text> : null}

                <View className='mt-6 flex-row items-center justify-between gap-3 pb-2'>
                  <Pressable
                    className='rounded-xl border border-[#d3def3] px-4 py-3'
                    onPress={() => {
                      setIsCreateEventOpen(false);
                      setIsCitySelectorOpen(false);
                    }}
                  >
                    <Text className='font-semibold text-[#3a5176]'>Cancelar</Text>
                  </Pressable>

                  <Pressable
                    className={`rounded-xl px-5 py-3 ${canCreateEvent ? 'bg-[#1f5fe0]' : 'bg-[#9db8e5]'}`}
                    disabled={!canCreateEvent}
                    onPress={handleCreateEvent}
                  >
                    <Text className='font-semibold text-white'>{isSubmitting ? 'Creando...' : 'Crear evento'}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
