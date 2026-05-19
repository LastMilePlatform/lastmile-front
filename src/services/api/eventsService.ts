import type { PaginatedResponse } from '@/types/pagination';

import { httpClient } from './httpClient';

export type EventSummary = {
  id: number;
  name: string;
  disasterType: string;
  city: string;
  description: string;
  date: string;
  createdBy: number;
};

export type GetEventsParams = {
  page?: number;
  limit?: number;
  city?: string;
  disasterType?: string;
  search?: string;
};

export type CreateEventPayload = {
  name: string;
  disasterType: string;
  city: string;
  description: string;
  date: string;
  createdBy: number;
};

export type ApiMessageResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

export type EventSupportersCount = {
  eventId: number;
  supportersCount: number;
};

function extractEventsArray(payload: unknown): EventSummary[] {
  if (Array.isArray(payload)) {
    return payload as EventSummary[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const root = payload as Record<string, unknown>;

  if (Array.isArray(root.data)) {
    return root.data as EventSummary[];
  }

  const nestedData = root.data;

  if (nestedData && typeof nestedData === 'object') {
    const nested = nestedData as Record<string, unknown>;

    if (Array.isArray(nested.data)) {
      return nested.data as EventSummary[];
    }

    if (Array.isArray(nested.events)) {
      return nested.events as EventSummary[];
    }
  }

  return [];
}

export async function getEvents({
  page = 1,
  limit = 50,
  city,
  disasterType,
  search,
}: GetEventsParams = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (city) {
    params.set('city', city);
  }

  if (disasterType) {
    params.set('disasterType', disasterType);
  }

  if (search) {
    params.set('search', search);
  }

  return httpClient<PaginatedResponse<EventSummary>>(`/events?${params.toString()}`);
}

export async function createEvent(payload: CreateEventPayload) {
  return httpClient<EventSummary>('/events', {
    method: 'POST',
    body: payload,
  });
}

export async function joinEvent(eventId: number, token: string) {
  return httpClient<ApiMessageResponse<EventSummary>>(`/events/${eventId}/join`, {
    method: 'POST',
    token,
  });
}

export async function leaveEvent(eventId: number, token: string) {
  return httpClient<ApiMessageResponse<EventSummary>>(`/events/${eventId}/join`, {
    method: 'DELETE',
    token,
  });
}

export async function getMyJoinedEvents(token: string) {
  const response = await httpClient<unknown>('/users/me/events', {
    token,
  });

  return extractEventsArray(response);
}

export async function getEventSupportersCount(eventId: number) {
  return httpClient<ApiMessageResponse<EventSupportersCount>>(`/events/${eventId}/supporters/count`);
}
