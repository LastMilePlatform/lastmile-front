import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Marker, Circle, type Region } from 'react-native-maps';
import Animated, { FadeInDown, FadeInUp, FadeOutUp, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  COLOMBIAN_CITIES,
  type ColombianCity,
  findColombianCityByName,
} from '@/modules/missions/constants/colombianCities';
import { OrganizerBottomTabs } from '@/modules/organizer/components/OrganizerBottomTabs';
import {
  createEvent,
  type EventSummary,
  getEvents,
} from '@/services/api/eventsService';
import { getPickupPoints, type PickupPoint } from '@/services/api/logisticsService';
import { getRememberedPickupPoints, rememberPickupPoints } from '@/services/state/pickupPointsMemory';

const COLOMBIA_REGION: Region = {
  latitude: 4.5709,
  longitude: -74.2973,
  latitudeDelta: 13,
  longitudeDelta: 13,
};

const FORM_GAP_ABOVE_TABS = 2;
const ORGANIZER_TABS_HEIGHT = 72;
const FORM_MIN_HEIGHT = 380;
const FORM_VERTICAL_MARGIN = 110;
const DEFAULT_CREATED_BY = 1;
const DEFAULT_DISASTER_TYPE = 'desastre_natural';

export function CreateMissionScreen() {
  const mapRef = useRef<MapView | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabsBottomOffset = Math.max(insets.bottom - 6, 6);
  const floatingControlsTop = Math.max(insets.top + 24, 48);
  const maxFormHeight = Math.max(
    FORM_MIN_HEIGHT,
    windowHeight - (tabsBottomOffset + ORGANIZER_TABS_HEIGHT + FORM_GAP_ABOVE_TABS + FORM_VERTICAL_MARGIN)
  );

  const [isEventMenuOpen, setIsEventMenuOpen] = useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [isCitySelectorOpen, setIsCitySelectorOpen] = useState(false);
  const [eventName, setEventName] = useState('');
  const [disasterType, setDisasterType] = useState(DEFAULT_DISASTER_TYPE);
  const [eventDescription, setEventDescription] = useState('');
  const [selectedCity, setSelectedCity] = useState<ColombianCity | null>(null);
  const [createdEventLabel, setCreatedEventLabel] = useState('');
  const [formContentHeight, setFormContentHeight] = useState(FORM_MIN_HEIGHT);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showOrganizerWelcome, setShowOrganizerWelcome] = useState(true);
  const controlsTop = showOrganizerWelcome ? floatingControlsTop + 62 : floatingControlsTop;

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

  const eventsById = useMemo(
    () => new Map(events.map((eventItem) => [eventItem.id, eventItem])),
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

          if (city) {
            return {
              pickupPoint,
              latitude: city.region.latitude,
              longitude: city.region.longitude,
            };
          }

          const relatedEvent =
            typeof pickupPoint.eventId === 'number' ? eventsById.get(pickupPoint.eventId) : undefined;

          const relatedEventCity = relatedEvent
            ? findColombianCityByName(relatedEvent.city)
            : null;

          if (relatedEventCity) {
            return {
              pickupPoint,
              latitude: relatedEventCity.region.latitude,
              longitude: relatedEventCity.region.longitude,
            };
          }

          return {
            pickupPoint,
            latitude: COLOMBIAN_CITIES[0].region.latitude,
            longitude: COLOMBIAN_CITIES[0].region.longitude,
          };
        })
        .filter(
          (
            pickupItem
          ): pickupItem is {
            pickupPoint: PickupPoint;
            latitude: number;
            longitude: number;
          } => Boolean(pickupItem)
        ),
    [eventsById, pickupPoints]
  );

  const panelHeight = Math.min(Math.max(formContentHeight + 16, FORM_MIN_HEIGHT), maxFormHeight);
  const shouldEnableScroll = formContentHeight + 16 > maxFormHeight;

  const loadMapData = useCallback(async () => {
    setIsLoadingEvents(true);
    setLoadError(null);

    const rememberedPickupPoints = getRememberedPickupPoints();

    const eventsPromise = getEvents({ page: 1, limit: 100 });
    const pickupPointsPromise = getPickupPoints().catch(async () => {
      // Retry once with explicit default pagination to handle transient backend validation/network issues.
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
    loadMapData();
  }, [loadMapData]);

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
      loadMapData();
    }, [loadMapData])
  );

  useFocusEffect(
    useCallback(() => {
      setShowOrganizerWelcome(true);
      const timeoutId = setTimeout(() => {
        setShowOrganizerWelcome(false);
      }, 3200);

      return () => {
        clearTimeout(timeoutId);
      };
    }, [])
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

  useEffect(() => {
    let isMounted = true;

    async function startLocationTracking() {
      setIsLocating(true);
      setLocationError(null);

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          if (isMounted) {
            setLocationError('Permiso de ubicacion denegado.');
            setIsLocating(false);
          }
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (isMounted) {
          setMyLocation({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          });
          setIsLocating(false);
        }

        locationWatchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 3000,
            distanceInterval: 8,
          },
          (position) => {
            if (!isMounted) {
              return;
            }

            setMyLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          }
        );
      } catch {
        if (isMounted) {
          setLocationError('No fue posible obtener tu ubicacion.');
          setIsLocating(false);
        }
      }
    }

    startLocationTracking();

    return () => {
      isMounted = false;
      locationWatchRef.current?.remove();
      locationWatchRef.current = null;
    };
  }, []);

  const centerOnMyLocation = () => {
    if (!myLocation) {
      return;
    }

    mapRef.current?.animateToRegion(
      {
        latitude: myLocation.latitude,
        longitude: myLocation.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      },
      700
    );
  };

  const handleSelectCity = (city: ColombianCity) => {
    setSelectedCity(city);
    setIsCitySelectorOpen(false);
    mapRef.current?.animateToRegion(city.region, 700);
  };

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
        description: trimmedDescription || 'Evento registrado desde aplicacion movil',
        date: new Date().toISOString(),
        createdBy: DEFAULT_CREATED_BY,
      });

      setEvents((prev) => [createdEvent, ...prev]);
      setCreatedEventLabel(`${createdEvent.name} - ${createdEvent.city}`);
      setEventName('');
      setDisasterType(DEFAULT_DISASTER_TYPE);
      setEventDescription('');
      setIsCreateEventOpen(false);
      setIsEventMenuOpen(false);
      mapRef.current?.animateToRegion(selectedCity.region, 700);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'No se pudo crear el evento.';
      setSubmitError(`No se pudo crear el evento. ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className='flex-1 bg-[#dce9f5]'>
      <MapView initialRegion={COLOMBIA_REGION} ref={mapRef} style={{ flex: 1 }}>

        {mappedEvents.map(({ event, city }) => (
          <Marker
            coordinate={{
              latitude: city.region.latitude,
              longitude: city.region.longitude,
            }}
            description={event.description}
            key={`event-${event.id}`}
            title={event.name}
          />
        ))}

        {mappedPickupPoints.map(({ pickupPoint, latitude, longitude }) => (
          <Marker
            coordinate={{ latitude, longitude }}
            description={pickupPoint.address}
            key={`pickup-${pickupPoint.id}`}
            pinColor='#0a84ff'
            title={`Punto de recogida: ${pickupPoint.name}`}
          />
        ))}

        {selectedCity && isCreateEventOpen ? (
          <Marker
            coordinate={{
              latitude: selectedCity.region.latitude,
              longitude: selectedCity.region.longitude,
            }}
            description={eventDescription.trim() || eventName.trim() || 'Evento pendiente'}
            title={selectedCity.name}
          />
        ) : null}

        {myLocation ? (
          <>
            <Circle
              center={myLocation}
              radius={20}
              strokeColor='#1f5fe0'
              fillColor='rgba(31,95,224,0.12)'
              strokeWidth={2}
              zIndex={1}
            />

            <Marker
              coordinate={myLocation}
              key='my-location-dot'
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#1f5fe0', borderWidth: 2, borderColor: 'rgba(31,95,224,0.18)' }} />
            </Marker>
          </>
        ) : null}
      </MapView>

      {isLoadingEvents ? (
        <View className='absolute right-4 top-24 rounded-full bg-white px-3 py-2'>
          <ActivityIndicator color='#1f5fe0' size='small' />
        </View>
      ) : null}

      {loadError ? (
        <View className='absolute right-4 top-24 rounded-xl bg-[#ffecef] px-3 py-2'>
          <Text className='text-xs text-[#9f2238]'>{loadError}</Text>
        </View>
      ) : null}

      {locationError ? (
        <View className='absolute left-20 right-4 top-24 rounded-xl bg-[#fff4e6] px-3 py-2'>
          <Text className='text-xs text-[#9a6400]'>{locationError}</Text>
        </View>
      ) : null}

      {showOrganizerWelcome ? (
        <Animated.View
          className='absolute left-4 right-4 rounded-2xl border border-[#d0def8] bg-white px-4 py-3'
          entering={FadeInDown.duration(220)}
          exiting={FadeOutUp.duration(220)}
          style={{
            top: Math.max(insets.top + 8, 12),
            zIndex: 75,
            elevation: 75,
          }}
        >
          <View className='flex-row items-center'>
            <View className='h-8 w-8 items-center justify-center rounded-full bg-[#eaf1ff]'>
              <MaterialIcons color='#1f5fe0' name='verified-user' size={18} />
            </View>
            <View className='ml-3 flex-1'>
              <Text className='text-sm font-bold text-[#16325d]'>Bienvenido Organizador</Text>
              <Text className='text-xs text-[#5b7190]'>Gestiona eventos y mapa desde este panel</Text>
            </View>
          </View>
        </Animated.View>
      ) : null}

      <View className='absolute right-4' style={{ top: controlsTop }}>
        <Pressable
          className='flex-row items-center gap-2 rounded-2xl bg-[#1f5fe0] px-4 py-2.5'
          disabled={!myLocation}
          onPress={centerOnMyLocation}
          style={{
            opacity: myLocation ? 1 : 0.65,
            shadowColor: '#0b327f',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.24,
            shadowRadius: 10,
            elevation: 8,
          }}
        >
          <View className='h-6 w-6 items-center justify-center rounded-full bg-[#e7efff]'>
            <FontAwesome5 color='#1f5fe0' name='crosshairs' size={11} />
          </View>
          <Text className='text-xs font-bold tracking-wide text-white'>Mi ubicación</Text>
        </Pressable>
      </View>

      {isLocating ? (
        <View className='absolute right-4 rounded-xl bg-white px-3 py-2' style={{ top: controlsTop + 44 }}>
          <Text className='text-xs text-[#4d648a]'>Obteniendo ubicacion...</Text>
        </View>
      ) : null}

      {createdEventLabel ? (
        <Animated.View
          className='absolute left-4 right-4 rounded-xl bg-[#183e80] px-4 py-3'
          entering={FadeInUp.duration(350)}
          layout={Layout.springify()}
          style={{
            top: controlsTop + 78,
            zIndex: 65,
            elevation: 65,
          }}
        >
          <Text className='text-sm font-semibold text-white'>Evento creado: {createdEventLabel}</Text>
        </Animated.View>
      ) : null}

      <View
        className='absolute left-4 items-start'
        style={{ top: controlsTop, zIndex: 70, elevation: 70 }}
      >
        <Pressable
          className='h-16 w-16 items-center justify-center rounded-full bg-[#d63c4c]'
          onPress={() => setIsEventMenuOpen((current) => !current)}
        >
          <MaterialIcons color='#fff' name='warning' size={28} />
        </Pressable>

        {isEventMenuOpen ? (
          <Animated.View
            className='mt-3 w-64 rounded-2xl border border-[#d8e7ff] bg-white p-3'
            entering={FadeInDown.duration(260)}
            layout={Layout.springify()}
          >
            <Pressable
              className='flex-row items-center rounded-xl bg-[#f4f8ff] px-3 py-3'
              onPress={() => {
                setIsCreateEventOpen(true);
                setIsEventMenuOpen(false);
              }}
            >
              <MaterialIcons color='#2f68d8' name='warning-amber' size={20} />
              <Text className='ml-2 text-sm font-semibold text-[#1d3357]'>
                Crear Evento (Desastre)
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>

      {isCreateEventOpen ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className='absolute bottom-0 left-0 right-0'
          style={{
            bottom: tabsBottomOffset + ORGANIZER_TABS_HEIGHT + FORM_GAP_ABOVE_TABS,
            zIndex: 45,
            elevation: 45,
          }}
        >
          <Animated.View
            className='rounded-3xl border border-[#d5e3fb] bg-white px-5 pt-5'
            entering={FadeInUp.duration(300)}
            layout={Layout.springify()}
            style={{ height: panelHeight }}
          >
            <ScrollView
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps='handled'
              onContentSizeChange={(_, contentHeight) => {
                setFormContentHeight(contentHeight);
              }}
              scrollEnabled={shouldEnableScroll}
              showsVerticalScrollIndicator={false}
            >
              <Text className='text-lg font-extrabold text-[#14243f]'>Crear Evento De Desastre Natural</Text>
              <Text className='mt-1 text-sm text-[#5f7396]'>
                Registra rapidamente el incidente y ubicalo en una ciudad de Colombia.
              </Text>

              <Text className='mt-4 mb-2 text-sm font-semibold text-[#233b61]'>Nombre Del Evento</Text>
              <TextInput
                className='rounded-xl border border-[#cfe0fb] bg-[#f8fbff] px-4 py-3 text-[#13274a]'
                onChangeText={setEventName}
                placeholder='Ej: Inundacion por lluvias intensas'
                placeholderTextColor='#8ba2c3'
                value={eventName}
              />

              <Text className='mt-4 mb-2 text-sm font-semibold text-[#233b61]'>Tipo De Desastre</Text>
              <TextInput
                className='rounded-xl border border-[#cfe0fb] bg-[#f8fbff] px-4 py-3 text-[#13274a]'
                onChangeText={setDisasterType}
                placeholder='Ej: inundacion'
                placeholderTextColor='#8ba2c3'
                value={disasterType}
              />

              <Text className='mt-4 mb-2 text-sm font-semibold text-[#233b61]'>Descripcion</Text>
              <TextInput
                className='rounded-xl border border-[#cfe0fb] bg-[#f8fbff] px-4 py-3 text-[#13274a]'
                multiline
                numberOfLines={4}
                onChangeText={setEventDescription}
                placeholder='Ej: Desbordamiento del rio por lluvias continuas en la zona norte.'
                placeholderTextColor='#8ba2c3'
                style={{ minHeight: 96, textAlignVertical: 'top' }}
                value={eventDescription}
              />

              <Text className='mt-4 mb-2 text-sm font-semibold text-[#233b61]'>Ciudad</Text>
              <Pressable
                className='rounded-xl border border-[#cfe0fb] bg-[#f8fbff] px-4 py-3'
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
                      onPress={() => handleSelectCity(city)}
                    >
                      <Text className='text-[#20375d]'>{city.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              {submitError ? (
                <Text className='mt-3 text-sm text-[#c3324d]'>{submitError}</Text>
              ) : null}

              <View className='mt-6 flex-row items-center justify-between'>
                <Pressable
                  className='rounded-xl border border-[#d3def3] px-4 py-3'
                  onPress={() => setIsCreateEventOpen(false)}
                >
                  <Text className='font-semibold text-[#3a5176]'>Cancelar</Text>
                </Pressable>
                <Pressable
                  className={`rounded-xl px-5 py-3 ${
                    canCreateEvent ? 'bg-[#1f5fe0]' : 'bg-[#9db8e5]'
                  }`}
                  disabled={!canCreateEvent}
                  onPress={handleCreateEvent}
                >
                  <Text className='font-semibold text-white'>
                    {isSubmitting ? 'Creando...' : 'Crear Evento'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      ) : null}

      <OrganizerBottomTabs activeTab='inicio' />
    </SafeAreaView>
  );
}
