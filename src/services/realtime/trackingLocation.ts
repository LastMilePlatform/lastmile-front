import { Platform } from 'react-native';
import * as Location from 'expo-location';

export type TrackingDevicePoint = {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  recordedAt: string;
};

type TrackingWatchOptions = {
  timeIntervalMs?: number;
  distanceIntervalMeters?: number;
};

type TrackingSubscription = {
  remove: () => void;
};

export async function startTrackingLocationWatch(
  onPoint: (point: TrackingDevicePoint) => void,
  options: TrackingWatchOptions = {}
): Promise<TrackingSubscription> {
  const { timeIntervalMs = 3000, distanceIntervalMeters = 10 } = options;

  if (Platform.OS === 'web') {
    if (!navigator?.geolocation) {
      throw new Error('Geolocalizacion no disponible en este navegador.');
    }

    const webGeolocationOptions: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: Math.max(15000, timeIntervalMs * 3),
    };

    // Take an initial precise reading to avoid stale browser cache positions.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onPoint({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy:
            typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : undefined,
          speed:
            typeof position.coords.speed === 'number' && Number.isFinite(position.coords.speed)
              ? position.coords.speed
              : undefined,
          heading:
            typeof position.coords.heading === 'number' && Number.isFinite(position.coords.heading)
              ? position.coords.heading
              : undefined,
          recordedAt: new Date(position.timestamp).toISOString(),
        });
      },
      (error) => {
        // eslint-disable-next-line no-console
        console.warn('[tracking][web] initial getCurrentPosition failed', {
          code: error?.code,
          message: error?.message,
        });
      },
      webGeolocationOptions
    );

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        onPoint({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy:
            typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : undefined,
          speed:
            typeof position.coords.speed === 'number' && Number.isFinite(position.coords.speed)
              ? position.coords.speed
              : undefined,
          heading:
            typeof position.coords.heading === 'number' && Number.isFinite(position.coords.heading)
              ? position.coords.heading
              : undefined,
          recordedAt: new Date(position.timestamp).toISOString(),
        });
      },
      (error) => {
        // eslint-disable-next-line no-console
        console.warn('[tracking][web] watchPosition error', {
          code: error?.code,
          message: error?.message,
        });
      },
      webGeolocationOptions
    );

    return {
      remove: () => navigator.geolocation.clearWatch(watchId),
    };
  }

  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== 'granted') {
    throw new Error('Permiso de ubicacion denegado.');
  }

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: timeIntervalMs,
      distanceInterval: distanceIntervalMeters,
    },
    (location: Location.LocationObject) => {
      onPoint({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy:
          typeof location.coords.accuracy === 'number' && Number.isFinite(location.coords.accuracy)
            ? location.coords.accuracy
            : undefined,
        speed:
          typeof location.coords.speed === 'number' && Number.isFinite(location.coords.speed)
            ? location.coords.speed
            : undefined,
        heading:
          typeof location.coords.heading === 'number' && Number.isFinite(location.coords.heading)
            ? location.coords.heading
            : undefined,
        recordedAt: new Date(location.timestamp).toISOString(),
      });
    }
  );

  return {
    remove: () => subscription.remove(),
  };
}
