import { httpClient } from './httpClient';

export type ShipmentLocationPoint = {
  shipmentId: number;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  recordedAt: string;
};

type ShipmentLocationPointApi = {
  shipmentId?: number;
  shipment_id?: number;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  speed?: number | null;
  heading?: number | null;
  recordedAt?: string;
  recorded_at?: string;
};

function normalizePoint(
  payload: ShipmentLocationPointApi,
  shipmentIdFallback: number
): ShipmentLocationPoint | null {
  const lat = payload.lat ?? payload.latitude;
  const lng = payload.lng ?? payload.longitude;

  if (typeof lat !== 'number' || Number.isNaN(lat) || typeof lng !== 'number' || Number.isNaN(lng)) {
    return null;
  }

  const shipmentId = payload.shipmentId ?? payload.shipment_id ?? shipmentIdFallback;

  return {
    shipmentId,
    lat,
    lng,
    speed: typeof payload.speed === 'number' ? payload.speed : undefined,
    heading: typeof payload.heading === 'number' ? payload.heading : undefined,
    recordedAt: payload.recordedAt ?? payload.recorded_at ?? new Date().toISOString(),
  } as ShipmentLocationPoint;
}

export async function getShipmentLatestLocation(shipmentId: number) {
  const response = await httpClient<ShipmentLocationPointApi | null>(
    `/logistics/shipments/${shipmentId}/location/latest`
  );

  if (!response) {
    return null;
  }

  return normalizePoint(response, shipmentId);
}

export async function getShipmentLocationHistory(shipmentId: number, limit = 100, before?: string) {
  const query = new URLSearchParams({ limit: String(limit) });

  if (before) {
    query.set('before', before);
  }

  const response = await httpClient<ShipmentLocationPointApi[]>(
    `/logistics/shipments/${shipmentId}/location/history?${query.toString()}`
  );

  const points: ShipmentLocationPoint[] = [];

  response.forEach((item) => {
    const normalized = normalizePoint(item, shipmentId);

    if (normalized) {
      points.push(normalized);
    }
  });

  return points;
}
