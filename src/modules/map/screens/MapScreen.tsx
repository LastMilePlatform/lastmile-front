import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Location from 'expo-location';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, Text, View } from 'react-native';
import MapView, { Marker, Circle, type Region } from 'react-native-maps';

import {
  findColombianCityByName,
  type ColombianCity,
} from '@/modules/missions/constants/colombianCities';
import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';
import { DonorBottomTabs, VOLUNTEER_WEB_PANEL_OFFSET } from '@/modules/donor/components/DonorBottomTabs';
import { type EventSummary, getEvents } from '@/services/api/eventsService';
import { getCampaigns, type Campaign } from '@/services/api/campaignsService';
import {
  connectTrackingSocket,
  setTrackingSocketHandlers,
  subscribeCampaignTracking,
  unsubscribeCampaignTracking,
  disconnectTrackingSocket,
} from '@/services/realtime/trackingSocket';

const COLOMBIA_REGION: Region = {
  latitude: 4.5709,
  longitude: -74.2973,
  latitudeDelta: 13,
  longitudeDelta: 13,
};

type EventWithCity = {
  event: EventSummary;
  city: ColombianCity;
};

export function MapScreen() {
  const { currentUser } = useAuthSession();
  const isDonor = currentUser?.role === 'donor';
  const isVolunteer = currentUser?.role === 'volunteer';
  const isWeb = Platform.OS === 'web';
  const webPanelInset = isVolunteer && isWeb ? VOLUNTEER_WEB_PANEL_OFFSET : (isDonor && isWeb ? 250 : 0);
  const hasWelcomeBanner = isDonor || isVolunteer;
  const [showDonorWelcome, setShowDonorWelcome] = useState(true);
  const donorWelcomeTop = 12;
  const floatingControlsTop = 24;
  const controlsTop = hasWelcomeBanner && showDonorWelcome ? floatingControlsTop + 62 : floatingControlsTop;
  const [mapRef, setMapRef] = useState<MapView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [volunteerPoints, setVolunteerPoints] = useState<Record<number, { latitude: number; longitude: number; shipmentId?: number; recordedAt?: string }>>({});

  const mappedEvents = useMemo<EventWithCity[]>(
    () =>
      events
        .map((eventItem) => {
          const city = findColombianCityByName(eventItem.city);

          if (!city) {
            return null;
          }

          return { event: eventItem, city };
        })
        .filter((eventItem): eventItem is EventWithCity => eventItem !== null),
    [events]
  );

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getEvents({ page: 1, limit: 100 });
      setEvents(response.data);
    } catch {
      setError('No fue posible cargar eventos en el mapa. Verifica el backend.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCampaigns = useCallback(async () => {
    try {
      const resp = await getCampaigns(1, 100);
      setCampaigns(resp.data);
      setSelectedCampaignId((current) => current ?? resp.data[0]?.id ?? null);
    } catch {
      // ignore failures; campaigns are optional for map
    }
  }, []);

  const refreshEventsSilently = useCallback(async () => {
    try {
      const response = await getEvents({ page: 1, limit: 100 });
      setEvents(response.data);
    } catch {
      // Keep previous markers when a background refresh fails.
    }
  }, []);

  useEffect(() => {
    loadEvents();
    void loadCampaigns();
  }, [loadEvents]);

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
      if (!hasWelcomeBanner) {
        setShowDonorWelcome(false);
        return;
      }

      setShowDonorWelcome(true);

      const timeoutId = setTimeout(() => {
        setShowDonorWelcome(false);
      }, 3200);

      return () => {
        clearTimeout(timeoutId);
      };
    }, [hasWelcomeBanner])
  );

  useEffect(() => {
    let isMounted = true;
    let watch: Location.LocationSubscription | null = null;

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

        const currentOptions: any = { accuracy: Location.Accuracy.Balanced };
        const current = await Location.getCurrentPositionAsync(currentOptions);

        if (isMounted) {
          setMyLocation({ latitude: current.coords.latitude, longitude: current.coords.longitude });
          setIsLocating(false);
        }

        const watchOptions: any = {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 3000,
          distanceInterval: 8,
        };

        watch = await Location.watchPositionAsync(watchOptions,
          (position) => {
            if (!isMounted) {
              return;
            }

            setMyLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
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
      watch?.remove();
    };
  }, []);

  // Tracking: subscribe to campaign volunteer feed when organizer selects a campaign
  useEffect(() => {
    if (currentUser?.role !== 'organizer' || !selectedCampaignId) {
      return;
    }

    const auth = { token: currentUser?.accessToken, userId: currentUser?.id, role: currentUser?.role };
    const socket = connectTrackingSocket(auth, {});

    setTrackingSocketHandlers({
      onVolunteerSnapshot: (points) => {
        const next: Record<number, { latitude: number; longitude: number; shipmentId?: number; recordedAt?: string }> = {};

        for (const p of points) {
          if (p.volunteerId) {
            next[p.volunteerId] = { latitude: p.lat, longitude: p.lng, shipmentId: p.shipmentId, recordedAt: p.recordedAt };
          }
        }

        setVolunteerPoints(next);
      },
      onVolunteerLocation: (p) => {
        if (!p.volunteerId) return;

        setVolunteerPoints((prev) => ({ ...prev, [p.volunteerId as number]: { latitude: p.lat, longitude: p.lng, shipmentId: p.shipmentId, recordedAt: p.recordedAt } }));
      },
      onError: (msg) => {
        // no-op for now
      },
    });

    subscribeCampaignTracking(selectedCampaignId);

    return () => {
      try {
        unsubscribeCampaignTracking(selectedCampaignId);
      } catch {
        /**/ }
      // keep socket alive for other modules; optionally disconnect if needed
    };
  }, [currentUser, selectedCampaignId]);

  const centerOnMyLocation = () => {
    if (!myLocation || !mapRef) {
      return;
    }

    try {
      if (typeof (mapRef as any).animateToRegion === 'function') {
        (mapRef as any).animateToRegion(
          {
            latitude: myLocation.latitude,
            longitude: myLocation.longitude,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          },
          700
        );
        return;
      }

      if (typeof (mapRef as any).animateCamera === 'function') {
        (mapRef as any).animateCamera({ center: { latitude: myLocation.latitude, longitude: myLocation.longitude }, pitch: 0, heading: 0, altitude: 1000 }, { duration: 700 });
        return;
      }
    } catch (err) {
      // fallback noop
    }
  };

  if (isDonor && isWeb) {
    return (
      <View className='flex-1 bg-[#eaf2ff]'>
        <View style={{ flex: 1, paddingLeft: webPanelInset }}>
          <View
            className={`flex-1 overflow-hidden border-0`}
          >
            {/* ...existing code... */}
          </View>
        </View>
        <DonorBottomTabs activeTab='inicio' />
      </View>
    );
  }
  return (
    <SafeAreaView className='flex-1 bg-[#eaf2ff]'>
      <View style={{ flex: 1, paddingLeft: webPanelInset }}>
        <View
          className={`flex-1 overflow-hidden ${
            isDonor ? 'border-0' : 'rounded-t-3xl border border-[#d3e2ff]'
          }`}
      >
        <MapView
          initialRegion={COLOMBIA_REGION}
          ref={setMapRef}
          style={{ flex: 1 }}
        >

          {mappedEvents.map(({ event, city }) => (
            <Marker
              coordinate={{
                latitude: city.region.latitude,
                longitude: city.region.longitude,
              }}
              description={event.description}
              key={event.id}
              title={event.name}
            />
          ))}

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

              {/* Small filled dot to mark exact location (shows above the circle) */}
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

          {/* Volunteer markers (organizer view) */}
          {Object.entries(volunteerPoints).map(([vid, point]) => {
            const id = Number(vid);
            return (
              <Marker
                key={`vol-${id}`}
                coordinate={{ latitude: point.latitude, longitude: point.longitude }}
                title={`Voluntario ${id}`}
                description={point.shipmentId ? `Envio #${point.shipmentId}` : 'Ubicacion reciente'}
                pinColor='#16a34a'
              />
            );
          })}
        </MapView>

        {hasWelcomeBanner && showDonorWelcome ? (
          <View
            className='absolute left-4 right-4 rounded-2xl border border-[#d0def8] bg-white px-4 py-3'
            style={{ top: donorWelcomeTop }}
          >
            <View className='flex-row items-center'>
              <View className='h-8 w-8 items-center justify-center rounded-full bg-[#eaf1ff]'>
                <MaterialIcons color='#1f5fe0' name={isVolunteer ? 'group' : 'volunteer-activism'} size={18} />
              </View>
              <View className='ml-3 flex-1'>
                <Text className='text-sm font-bold text-[#16325d]'>
                  {isVolunteer ? 'Bienvenido Voluntario' : 'Bienvenido Donante'}
                </Text>
                <Text className='text-xs text-[#5b7190]'>
                  {isVolunteer
                    ? 'Consulta los eventos activos en tiempo real para ubicar donde puedes apoyar.'
                    : 'Apoya campanas activas desde el mapa y sigue tus aportes.'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {isLoading ? (
          <View className='absolute left-0 right-0 items-center' style={{ top: hasWelcomeBanner && showDonorWelcome ? 86 : 12 }}>
            <View className='rounded-full bg-white px-4 py-2'>
              <ActivityIndicator color='#1f5fe0' size='small' />
            </View>
          </View>
        ) : null}

        {error ? (
          <View className='absolute left-3 right-3 rounded-xl bg-[#ffecef] px-3 py-2' style={{ top: hasWelcomeBanner && showDonorWelcome ? 86 : 12 }}>
            <Text className='text-sm text-[#a1263d]'>{error}</Text>
          </View>
        ) : null}

        {locationError ? (
          <View className='absolute left-3 right-3 rounded-xl bg-[#fff4e6] px-3 py-2' style={{ top: hasWelcomeBanner && showDonorWelcome ? 132 : 64 }}>
            <Text className='text-sm text-[#9a6400]'>{locationError}</Text>
          </View>
        ) : null}

        {!isWeb ? (
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
        ) : null}

        {isLocating ? (
          <View className='absolute right-4 rounded-xl bg-white px-3 py-2' style={{ top: controlsTop + 44 }}>
            <Text className='text-xs text-[#4d648a]'>Obteniendo ubicacion...</Text>
          </View>
        ) : null}
      </View>
      </View>

      {isDonor ? <DonorBottomTabs activeTab='inicio' /> : null}
      {isVolunteer && isWeb ? <DonorBottomTabs activeTab='mapa' /> : null}
    </SafeAreaView>
  );
}