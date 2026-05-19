import { useEffect } from 'react';
import { Platform } from 'react-native';

import { connectRealtime, emitRealtime } from './realtimeService';
import { startTrackingLocationWatch } from './trackingLocation';

const MAX_REJECT_ACCURACY_WEB_METERS = 5000;
const MIN_MOVEMENT_TO_RESEND_METERS = 8;
const FORCE_RESEND_INTERVAL_MS = 15000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

export function useVolunteerLocationBroadcast(
  token: string | undefined,
  userId: number | undefined,
) {
  useEffect(() => {
    if (!token || !userId) {
      return;
    }

    connectRealtime({ token, userId, role: 'volunteer' });

    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    let lastSent: { lat: number; lng: number; accuracy?: number; sentAt: number } | null = null;

    const start = async () => {
      try {
        const sub = await startTrackingLocationWatch(
          (point) => {
            if (cancelled) return;

            if (Platform.OS === 'web') {
              const now = Date.now();
              const accuracy =
                typeof point.accuracy === 'number' && Number.isFinite(point.accuracy)
                  ? point.accuracy
                  : undefined;

              // Reject only extremely noisy browser fixes (usually coarse IP location).
              if (typeof accuracy === 'number' && accuracy > MAX_REJECT_ACCURACY_WEB_METERS) {
                return;
              }

              if (lastSent) {
                const moved = distanceMeters(lastSent.lat, lastSent.lng, point.lat, point.lng);
                const hasMovedEnough = moved >= MIN_MOVEMENT_TO_RESEND_METERS;
                const betterAccuracy =
                  typeof accuracy === 'number' &&
                  (typeof lastSent.accuracy !== 'number' || accuracy + 20 < lastSent.accuracy);
                const forcedByTime = now - lastSent.sentAt >= FORCE_RESEND_INTERVAL_MS;

                if (!hasMovedEnough && !betterAccuracy && !forcedByTime) {
                  return;
                }
              }

              const payload = {
                lat: point.lat,
                lng: point.lng,
                accuracy: point.accuracy,
                recordedAt: point.recordedAt,
              };

              // Emit compatibility aliases because backend event names can vary by environment.
              emitRealtime('volunteer.location.update', payload);
              emitRealtime('volunteer.location.changed', payload);
              emitRealtime('volunteer.location.updated', payload);

              lastSent = {
                lat: point.lat,
                lng: point.lng,
                accuracy,
                sentAt: now,
              };

              return;
            }

            emitRealtime('volunteer.location.update', { lat: point.lat, lng: point.lng });
          },
          { timeIntervalMs: 5000, distanceIntervalMeters: 15 },
        );

        if (cancelled) {
          sub.remove();
          return;
        }

        subscription = sub;
      } catch {
        // Permiso de ubicación no concedido, se omite silenciosamente
      }
    };

    void start();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [token, userId]);
}
