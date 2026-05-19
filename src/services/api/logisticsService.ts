import type { PaginatedResponse } from '@/types/pagination';

import { httpClient } from './httpClient';

export type PickupPoint = {
  id: number;
  name: string;
  address: string;
  city: string;
  eventId: number;
  latitude?: number;
  longitude?: number;
};

export type CreatePickupPointPayload = {
  name: string;
  address: string;
  city: string;
  eventId: number;
};

export type ShipmentStatus = 'pending' | 'assigned' | 'in_transit' | 'delivered';

export type Shipment = {
  id: number;
  campaignId: number;
  eventId?: number;
  pickupPointId: number;
  assignedVolunteerId: number | null;
  status: ShipmentStatus;
  createdAt: string;
};

export type CreateShipmentPayload = {
  campaignId: number;
  pickupPointId: number;
};

export async function getPickupPoints(page = 1, limit = 100, token?: string) {
  return httpClient<PaginatedResponse<PickupPoint>>(
    `/logistics/pickup-points?page=${page}&limit=${limit}`,
    { token }
  );
}

export async function createPickupPoint(payload: CreatePickupPointPayload, token?: string) {
  return httpClient<PickupPoint>('/logistics/pickup-points', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function getShipments(page = 1, limit = 100, token?: string) {
  return httpClient<PaginatedResponse<Shipment>>(
    `/logistics/shipments?page=${page}&limit=${limit}`,
    { token }
  );
}

export async function assignShipmentVolunteer(shipmentId: number, volunteerId: number, token?: string) {
  return httpClient<Shipment>(`/logistics/shipments/${shipmentId}/assign-volunteer`, {
    method: 'PATCH',
    token,
    body: { volunteerId },
  });
}

export async function createShipment(payload: CreateShipmentPayload, token?: string) {
  return httpClient<Shipment>('/logistics/shipments', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function getMyShipments(token: string, page = 1, limit = 20) {
  return httpClient<PaginatedResponse<Shipment>>(
    `/logistics/shipments?assignedVolunteerId=me&page=${page}&limit=${limit}`,
    { token }
  );
}

export async function updateShipmentStatus(
  shipmentId: number,
  status: Extract<ShipmentStatus, 'in_transit' | 'delivered'>,
  token: string
) {
  return httpClient<Shipment>(`/logistics/shipments/${shipmentId}/status`, {
    method: 'PATCH',
    token,
    body: { status },
  });
}
